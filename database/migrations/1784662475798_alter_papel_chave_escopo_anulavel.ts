import { BaseSchema } from '@adonisjs/lucid/schema'

import { temColuna, temGatilho, temIndice } from '../helpers/esquema.js'

/**
 * `papel.chave_escopo` deixa de ser `NOT NULL`.
 *
 * ── O que aconteceu ────────────────────────────────────────────────────────────
 *
 * Em `api-qua`, criar uma empresa passou a devolver erro. No journal:
 *
 *     ER_NO_DEFAULT_FOR_FIELD (1364)
 *     Field 'chave_escopo' doesn't have a default value
 *     insert into `papel` (`created_at`, `descricao`, `empresa_id`, `escopo`,
 *                          `id`, `nome`, `updated_at`) values (...)
 *
 * O `INSERT` é o de `app/helpers/papeis_da_empresa.ts`, que clona os 10 papéis
 * padrão para a empresa nova. Não menciona `chave_escopo` porque nunca precisou
 * de o fazer: quem a preenchia era o gatilho `papel_chave_escopo_bi`.
 *
 * Naquele servidor o gatilho não existe. A migração 796 faz, por esta ordem:
 *
 *     4. ALTER TABLE papel MODIFY chave_escopo VARCHAR(64) NOT NULL
 *     5. CREATE TRIGGER papel_chave_escopo_bi ...
 *
 * O MySQL não faz DDL transaccional. O passo 5 falhar deixa o passo 4 feito — e o
 * que fica é uma coluna obrigatória, sem valor por omissão, sem ninguém a
 * preenchê-la. A partir daí NENHUMA escrita em `papel` passa. Não é o registo de
 * empresas que fica degradado: é toda a tabela que fica só de leitura.
 *
 * ── A regra que isto deixa ─────────────────────────────────────────────────────
 *
 * **Um campo novo tem de ter valor por omissão, ou ser opcional.** Uma coluna
 * derivada — que só existe para arrumação interna, como esta — nunca pode ser o
 * motivo de uma escrita de negócio falhar. O `NOT NULL` foi posto com boa
 * intenção (o comentário da 796 dizia: "se algum dia um caminho os contornar, o
 * erro aparece na escrita em vez de uma linha silenciosamente fora do índice"),
 * mas escolheu falhar a escrita em vez de a deixar passar. O preço dessa escolha
 * foi uma paragem total; o preço da outra teria sido uma linha mal indexada.
 *
 * ── Porquê anulável e não com um valor por omissão ─────────────────────────────
 *
 * Não há valor por omissão que sirva. A chave é `COALESCE(empresa_id, escopo)` —
 * depende da linha. Um `DEFAULT ''` fixo poria todas as linhas por preencher na
 * mesma entrada do índice único, e duas empresas com um papel "Admin" cada
 * passariam a colidir: trocava-se um erro por outro. Anulável é o que deixa a
 * escrita passar sempre.
 *
 * ── E a unicidade, fica perdida? ───────────────────────────────────────────────
 *
 * Não, porque a coluna deixou de depender só do gatilho. Passam a preenchê-la:
 *
 *   1. o `@beforeSave` de `app/models/auth/papel.ts` — cobre `Papel.create`,
 *      `createMany` e os seeders;
 *   2. o `multiInsert` de `app/helpers/papeis_da_empresa.ts`, à mão, porque não
 *      passa pelo model;
 *   3. os gatilhos, para quem escreve de fora — o `taesic-backoffice-api`, que
 *      partilha esta tabela, e o SQL à mão.
 *
 * Os três calculam o mesmo, a partir da mesma função (`chaveEscopoDe`). O NULL
 * passa a ser o que devia sempre ter sido: o sinal de que algo escreveu por um
 * caminho que ninguém previu — visível numa consulta, e não uma paragem.
 * `tests/functional/papel_chave_escopo.spec.ts` corre os caminhos todos SEM
 * gatilhos, que é a situação de `api-qua`.
 *
 * ── Ordem dos passos ───────────────────────────────────────────────────────────
 *
 * Ao contrário da 796, o que pode falhar vem DEPOIS do que desbloqueia. Primeiro
 * a coluna fica anulável — a partir daí a tabela é escrevível, aconteça o que
 * acontecer a seguir. Só então se tenta o resto.
 */
export default class extends BaseSchema {
  protected tableName = 'papel'

  async up() {
    this.defer(async (db) => {
      if (!(await temColuna(db, 'papel', 'chave_escopo'))) {
        await db.rawQuery('ALTER TABLE papel ADD COLUMN chave_escopo VARCHAR(64) NULL')
      } else {
        // O passo que corrige `api-qua`. Idempotente: repetir um MODIFY para o
        // estado em que a coluna já está não é erro.
        await db.rawQuery('ALTER TABLE papel MODIFY chave_escopo VARCHAR(64) NULL')
      }

      // Linhas que tenham ficado por preencher enquanto não havia gatilho.
      // `<=>` e não `<>`: com NULL de um dos lados, `<>` devolve NULL, o WHERE
      // trata-o como falso, e eram precisamente essas linhas que ficavam de fora.
      await db.rawQuery(
        `UPDATE papel
            SET chave_escopo = COALESCE(empresa_id, escopo)
          WHERE NOT (chave_escopo <=> COALESCE(empresa_id, escopo))`
      )

      // Os gatilhos, para quem escreve nesta tabela sem passar pela aplicação.
      //
      // FALHAR AQUI NÃO PÁRA A MIGRAÇÃO, e isso é deliberado. Reproduzido com um
      // utilizador restrito: "You do not have the SUPER privilege and binary logging
      // is enabled" (erro 1419) — e o privilégio `TRIGGER`, concedido à parte do
      // resto, é a outra causa possível. Uma das duas explica `api-qua`. Antes, a
      // aplicação dependia deles e engoli-los seria esconder uma avaria; agora
      // são a terceira das três defesas, e uma migração que rebente aqui bloqueia
      // TODAS as migrações seguintes em todos os deploys — por causa de uma
      // salvaguarda de que a aplicação já não precisa. O aviso fica no log do
      // deploy, com o que fazer.
      for (const [nome, momento] of [
        ['papel_chave_escopo_bi', 'BEFORE INSERT'],
        ['papel_chave_escopo_bu', 'BEFORE UPDATE'],
      ]) {
        if (await temGatilho(db, nome)) continue

        try {
          await db.rawQuery(
            `CREATE TRIGGER ${nome} ${momento} ON papel
               FOR EACH ROW SET NEW.chave_escopo = COALESCE(NEW.empresa_id, NEW.escopo)`
          )
        } catch (erro: any) {
          console.warn(
            `[migração] não foi possível criar o gatilho ${nome}: ${erro?.sqlMessage ?? erro?.message}\n` +
              '  A aplicação preenche `papel.chave_escopo` por si (ver app/models/auth/papel.ts),\n' +
              '  por isso isto NÃO impede o funcionamento. Fica sem cobertura quem escreva na\n' +
              '  tabela `papel` por fora — o taesic-backoffice-api e o SQL à mão.\n' +
              '  Para corrigir, conforme o erro acima:\n' +
              '    · "SUPER privilege ... binary logging" (1419) -> pôr\n' +
              '      log_bin_trust_function_creators = 1 na secção [mysqld] da configuração\n' +
              '      do motor, e reiniciá-lo;\n' +
              '    · "command denied ... TRIGGER" (1142) -> GRANT TRIGGER ao utilizador da BD.\n' +
              '  Depois, voltar a correr esta migração (é idempotente).'
          )
        }
      }

      // O índice pode não existir: na 796 vinha depois dos gatilhos, portanto um
      // servidor que tenha morrido a criá-los também não chegou aqui.
      //
      // `deleted_at` continua de fora, pela razão de sempre: no MySQL os NULL
      // contam como distintos num índice único, e incluí-lo deixaria passar duas
      // linhas ACTIVAS com o mesmo nome.
      if (!(await temIndice(db, 'papel', 'papel_escopo_nome_unique'))) {
        await db.rawQuery(
          'CREATE UNIQUE INDEX papel_escopo_nome_unique ON papel (chave_escopo, nome)'
        )
      }
    })
  }

  /**
   * O `down` NÃO repõe o `NOT NULL`.
   *
   * Reverter esta migração é reverter uma correcção de disponibilidade: devolver
   * a coluna ao estado em que uma escrita de negócio pode ser recusada por causa
   * de uma coluna de arrumação. Se o objectivo for desfazer o desenho todo, é a
   * 796 que tem de ser revertida — esta não tem nada de seu para largar.
   */
  async down() {}
}
