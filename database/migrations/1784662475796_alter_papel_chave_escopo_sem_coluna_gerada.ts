import { BaseSchema } from '@adonisjs/lucid/schema'

import { colunaEGerada, temColuna, temGatilho, temIndice } from '../helpers/esquema.js'

/**
 * `papel.chave_escopo` deixa de ser uma coluna GERADA e passa a ser uma coluna
 * normal mantida por gatilho.
 *
 * ── Porquê ─────────────────────────────────────────────────────────────────────
 *
 * A migração 791 criava-a como `VARCHAR(64) GENERATED ALWAYS AS
 * (COALESCE(empresa_id, escopo)) VIRTUAL` e criava um índice único sobre ela.
 * Isso funciona no MySQL 8, que é o que corre em desenvolvimento. **No servidor
 * não funciona:**
 *
 *     CREATE UNIQUE INDEX papel_escopo_nome_unique ON papel (chave_escopo, nome)
 *     ERROR: Function or expression 'coalesce(`empresa_id`,`escopo`)' cannot be
 *            used in the GENERATED ALWAYS AS clause of `chave_escopo`
 *
 * Repare-se onde falha: a COLUNA é aceite, o ÍNDICE sobre ela é que não. O motor
 * revalida a expressão com regras mais apertadas quando a indexa, e recusa-a.
 *
 * O que isto revelou é maior do que o erro: **o motor de base de dados do
 * servidor não é o mesmo do ambiente de desenvolvimento.** Uma migração pode
 * portanto passar em dev, passar nos testes, e parar o deploy — que foi
 * exactamente o que aconteceu. Enquanto os dois ambientes não forem o mesmo
 * motor e a mesma versão, vale a regra: **nada de funcionalidades específicas de
 * um motor no caminho crítico.** Colunas geradas indexadas são precisamente isso.
 *
 * ── O desenho novo ─────────────────────────────────────────────────────────────
 *
 *   chave_escopo  VARCHAR(64) NULL   — coluna normal, ANULÁVEL
 *   dois gatilhos BEFORE INSERT / BEFORE UPDATE que a preenchem com
 *   COALESCE(empresa_id, escopo)
 *
 * A coluna nasceu aqui `NOT NULL`, e isso deitou abaixo o registo de empresas em
 * `api-qua` — ver o passo 4 do `up()` para o relato inteiro. Fica anulável, e quem
 * a preenche passou a ser (também) a aplicação.
 *
 * **Gatilho e não um hook do model**, e isto é o ponto que decide: a tabela
 * `papel` é escrita por DOIS projectos (`taesic-backend` e `taesic-backoffice-api`,
 * mesma base de dados), pelos seeders, pelo `multiInsert` da migração 792 e por
 * SQL à mão. Um `@beforeSave` no model do Lucid não cobre nenhum desses caminhos
 * a não ser o primeiro. O gatilho cobre-os todos, sem ninguém ter de saber que
 * existe — que é a mesma garantia que a coluna gerada dava, obtida com uma
 * funcionalidade que qualquer motor suporta há vinte anos.
 *
 * O preço é a invisibilidade: quem ler o model não vê o gatilho. Fica dito no
 * `@column()` de `chave_escopo` em `app/models/papel.ts`, e
 * `papel_chave_escopo.spec.ts` falha se algum caminho de escrita a deixar
 * dessincronizada.
 *
 * ── Idempotente e convergente ──────────────────────────────────────────────────
 *
 * As três situações possíveis acabam no mesmo estado:
 *
 *   dev/teste   `chave_escopo` já existe e é GERADA (791 correu por inteiro)
 *               → larga o índice, larga a coluna, recria normal, backfill, gatilhos
 *   servidor    a coluna existe e é GERADA, sem índice (791 morreu a indexá-la)
 *               → o mesmo caminho, sem índice para largar
 *   base nova   não existe nada
 *               → cria de raiz
 */
export default class extends BaseSchema {
  protected tableName = 'papel'

  async up() {
    this.defer(async (db) => {
      // 1. Se a coluna existe mas é gerada, tem de sair. Não há `ALTER ... MODIFY`
      //    que converta uma coluna gerada em normal preservando o valor, e o índice
      //    depende dela, por isso o índice sai primeiro.
      if (
        (await temColuna(db, 'papel', 'chave_escopo')) &&
        (await colunaEGerada(db, 'papel', 'chave_escopo'))
      ) {
        if (await temIndice(db, 'papel', 'papel_escopo_nome_unique')) {
          await db.rawQuery('DROP INDEX papel_escopo_nome_unique ON papel')
        }
        await db.rawQuery('ALTER TABLE papel DROP COLUMN chave_escopo')
      }

      // 2. A coluna normal, ANULÁVEL — e assim fica. Ver o passo 4.
      if (!(await temColuna(db, 'papel', 'chave_escopo'))) {
        await db.rawQuery('ALTER TABLE papel ADD COLUMN chave_escopo VARCHAR(64) NULL')
      }

      // 3. Backfill. `<=>` e não `<>`: com NULL dos dois lados, `<>` devolve NULL
      //    (que o WHERE trata como falso) e as linhas por preencher ficavam de fora.
      await db.rawQuery(
        `UPDATE papel
            SET chave_escopo = COALESCE(empresa_id, escopo)
          WHERE NOT (chave_escopo <=> COALESCE(empresa_id, escopo))`
      )

      // 4. A coluna FICA ANULÁVEL. Aqui esteve um
      //    `MODIFY chave_escopo VARCHAR(64) NOT NULL`, e foi ele que deitou abaixo
      //    o registo de empresas em `api-qua`.
      //
      //    O raciocínio original era: "os gatilhos garantem que nunca fica vazia;
      //    o NOT NULL garante que, se algum caminho os contornar, o erro aparece na
      //    escrita em vez de uma linha silenciosamente fora do índice". O que
      //    aconteceu foi o passo 5 falhar — reproduzido: "You do not have the SUPER
      //    privilege and binary logging is enabled" (erro 1419), e o privilégio
      //    `TRIGGER` é outra causa possível — e, como o MySQL/MariaDB não faz DDL
      //    transaccional, este passo 4 ficou feito. Coluna obrigatória, sem valor
      //    por omissão, sem ninguém a preenchê-la: a tabela `papel` inteira ficou
      //    só de leitura, e criar uma empresa deixou de ser possível.
      //
      //    Um campo novo tem de ter valor por omissão ou ser opcional. Uma coluna
      //    derivada, de arrumação interna, nunca pode ser o motivo de uma escrita de
      //    negócio falhar. Quem a preenche passou a ser a aplicação (o `@beforeSave`
      //    em app/models/auth/papel.ts, nos dois backends, e o valor à mão no
      //    `multiInsert` de papeis_da_empresa.ts); os gatilhos ficam para quem
      //    escreve por fora. Ver a migração 798 e a secção 7.20 do CLAUDE.md.
      //
      //    O `MODIFY` explícito não é decorativo: numa base onde esta migração já
      //    correu na versão antiga e ficou a meio, é ele que solta a coluna.
      await db.rawQuery('ALTER TABLE papel MODIFY chave_escopo VARCHAR(64) NULL')

      // 5. Os gatilhos. Uma instrução só por gatilho, portanto sem `BEGIN...END` e
      //    sem mexer no delimitador — que não é sequer possível por esta via.
      //
      //    FALHAR AQUI NÃO PÁRA A MIGRAÇÃO, e é essa a diferença que desbloqueia o
      //    deploy. Enquanto isto rebentava, a migração ficava por registar e
      //    NENHUMA das seguintes corria — o que prendeu `api-qua` na 796 e tornou
      //    inalcançável a própria migração que repara isto. A aplicação já não
      //    depende dos gatilhos; um deploy inteiro não pode ficar refém de uma
      //    salvaguarda para terceiros.
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
            [
              `[migração] não foi possível criar o gatilho ${nome}: ${erro?.sqlMessage ?? erro?.message}`,
              '  A aplicação preenche `papel.chave_escopo` por si (ver app/models/auth/papel.ts),',
              '  por isso isto NÃO impede o funcionamento. Fica sem cobertura quem escreva na',
              '  tabela `papel` por fora — o taesic-backoffice-api e o SQL à mão.',
              '  Para corrigir: conceder o privilégio TRIGGER ao utilizador da base de dados e',
              '  voltar a correr esta migração.',
            ].join('\n')
          )
        }
      }

      // 6. E finalmente o índice, agora sobre uma coluna normal.
      //
      //    `deleted_at` continua de fora, pela razão de sempre: no MySQL os NULL
      //    contam como distintos num índice único, portanto incluí-lo deixaria
      //    passar duas linhas ACTIVAS com o mesmo nome — que é exactamente o que o
      //    índice existe para impedir. Um papel apagado com soft delete é REVIVIDO
      //    ao ser criado outro com o mesmo nome.
      if (!(await temIndice(db, 'papel', 'papel_escopo_nome_unique'))) {
        await db.rawQuery(
          'CREATE UNIQUE INDEX papel_escopo_nome_unique ON papel (chave_escopo, nome)'
        )
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (await temIndice(db, 'papel', 'papel_escopo_nome_unique')) {
        await db.rawQuery('DROP INDEX papel_escopo_nome_unique ON papel')
      }

      for (const gatilho of ['papel_chave_escopo_bi', 'papel_chave_escopo_bu']) {
        if (await temGatilho(db, gatilho)) {
          await db.rawQuery(`DROP TRIGGER ${gatilho}`)
        }
      }

      if (await temColuna(db, 'papel', 'chave_escopo')) {
        await db.rawQuery('ALTER TABLE papel DROP COLUMN chave_escopo')
      }
    })
  }
}
