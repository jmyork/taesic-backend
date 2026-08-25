import { BaseSchema } from '@adonisjs/lucid/schema'

import { temColuna, temIndice, temRestricao } from '../helpers/esquema.js'

/**
 * Papéis passam a pertencer a uma EMPRESA. As permissões, não.
 *
 * Até aqui `papel` tinha `nome` com unicidade GLOBAL e nenhuma coluna de empresa:
 * os 15 papéis eram partilhados por todos os inquilinos. Nada estava a vazar —
 * nenhuma rota deixava um inquilino editá-los — mas era impossível delegar:
 * bastaria expor a edição para a empresa A, ao mudar "Vendedor", mudar o Vendedor
 * de TODAS as empresas.
 *
 * As PERMISSÕES continuam um catálogo global, e de propósito. Uma permissão aqui
 * é um nome de rota (`domain_produtos.store`) — é o que o *software* sabe fazer,
 * não dados do cliente. Uma empresa não pode inventar uma permissão porque não
 * pode acrescentar uma rota. Por inquilino, seriam 296 linhas duplicadas por
 * empresa e cada rota nova exigiria um backfill em todas; falhar uma tiraria
 * silenciosamente a funcionalidade a essa empresa. A empresa escolhe quais das
 * permissões existentes cada um dos SEUS papéis tem — que é a gestão que
 * interessa.
 *
 * ── Os três âmbitos ────────────────────────────────────────────────────────────
 *
 *   plataforma  empresa_id NULL — os papéis do dono da plataforma (Platform_*).
 *   modelo      empresa_id NULL — os 10 padrões, clonados no registo de empresa.
 *                                 Nunca atribuíveis a ninguém.
 *   empresa     empresa_id != NULL — os papéis próprios de uma empresa. Os
 *                                 únicos que um utilizador de inquilino recebe.
 *
 * `escopo` existe porque a alternativa era decidir pelo NOME, e é aí que estava a
 * armadilha desta mudança: `AdminOnlyMiddleware` reconhecia o administrador de
 * plataforma por `nome LIKE 'Platform_%'`. Com a unicidade a passar a ser por
 * empresa, uma empresa podia criar um papel chamado `Platform_Admin` e escalar a
 * administrador da plataforma. Com `escopo`, o nome deixa de decidir nada.
 *
 * ── Unicidade ──────────────────────────────────────────────────────────────────
 *
 * `unique(empresa_id, nome)` não serviria: no MySQL os NULL contam como
 * distintos num índice único, portanto dois `Platform_Admin` com `empresa_id`
 * NULL passariam os dois. `chave_escopo` — uma coluna gerada,
 * `COALESCE(empresa_id, escopo)` — dá uma chave sempre não-nula e cobre os três
 * casos de uma vez: ('plataforma','Platform_Admin'), ('modelo','Vendedor') e
 * (<uuid-da-empresa>,'Vendedor').
 *
 * `deleted_at` NÃO entra no índice, também por causa dos NULL: duas linhas
 * activas com o mesmo nome passariam ambas, que é exactamente o que o índice
 * existe para impedir. Um papel apagado com soft delete é REVIVIDO ao ser criado
 * outro com o mesmo nome — o mesmo padrão já usado em
 * `domain_user_papel_repository.assign()` e em `concederPermissao()`.
 */
export default class extends BaseSchema {
  protected tableName = 'papel'

  /**
   * ── Re-executável, e não é zelo ────────────────────────────────────────────────
   *
   * Cada passo pergunta primeiro se já está feito. Foi esta migração que parou o
   * deploy de `api-qua`: uma tentativa anterior deixou `empresa_id` e `escopo` na
   * tabela e não chegou a registar-se em `adonis_schema` (o MySQL não faz DDL
   * transaccional), e a tentativa seguinte bateu em `Duplicate column name`. A
   * partir daí nada mais avançou — nem esta, nem o backfill que vem a seguir, e os
   * papéis todos ficaram no `escopo` por omissão, `modelo`, que não é atribuível a
   * ninguém.
   *
   * Escrita em `defer` + SQL directo, e não com `this.schema.alterTable()`: o knex
   * constrói a instrução ANTES de qualquer pergunta ao `information_schema` poder
   * ser feita. Ver `database/helpers/esquema.ts`.
   */
  async up() {
    this.defer(async (db) => {
      if (!(await temColuna(db, 'papel', 'empresa_id'))) {
        await db.rawQuery('ALTER TABLE papel ADD COLUMN empresa_id CHAR(36) NULL')
      }

      if (!(await temRestricao(db, 'papel', 'papel_empresa_id_foreign'))) {
        await db.rawQuery(
          `ALTER TABLE papel
             ADD CONSTRAINT papel_empresa_id_foreign
             FOREIGN KEY (empresa_id) REFERENCES empresa (id) ON DELETE CASCADE`
        )
      }

      // Omitido, um papel nasce `modelo`: não é atribuível a utilizadores e não é
      // de plataforma. Se algum caminho de código se esquecer de o definir, o que
      // sai é inofensivo — e é isso que se quer de um valor por omissão numa
      // fronteira de acesso.
      if (!(await temColuna(db, 'papel', 'escopo'))) {
        await db.rawQuery(
          `ALTER TABLE papel
             ADD COLUMN escopo ENUM('plataforma', 'modelo', 'empresa')
             NOT NULL DEFAULT 'modelo'`
        )
      }

      // A unicidade global do nome é o que impedia dois inquilinos de terem, cada
      // um, o seu "Vendedor". `papel_nome_unique` é o nome que o knex lhe deu na
      // migração que criou a tabela.
      if (await temIndice(db, 'papel', 'papel_nome_unique')) {
        await db.rawQuery('DROP INDEX papel_nome_unique ON papel')
      }

      // `chave_escopo` e o índice único NÃO nascem aqui — nascem em
      // `..._796_alter_papel_chave_escopo_sem_coluna_gerada`, e há uma razão de peso.
      //
      // Esta migração criava uma coluna GERADA (`GENERATED ALWAYS AS
      // (COALESCE(empresa_id, escopo)) VIRTUAL`) e indexava-a. Funciona no MySQL 8,
      // que é o que corre em desenvolvimento. **No servidor não funciona**: o
      // `CREATE UNIQUE INDEX` é recusado com "Function or expression
      // 'coalesce(`empresa_id`,`escopo`)' cannot be used in the GENERATED ALWAYS AS
      // clause of `chave_escopo`" — a coluna é aceite, indexá-la não.
      //
      // Ou seja: a mesma migração passava em dev e parava o deploy. Passou a ser
      // uma coluna normal mantida por gatilho, que qualquer motor aceita. Ver a
      // migração 796 para o desenho completo e para a conversão das bases que já
      // ficaram com a coluna gerada.

      // O invariante deixa de depender de nenhum programador o respeitar: um papel
      // de empresa TEM empresa, um de plataforma ou modelo NÃO tem. Nenhum caminho
      // de código consegue gravar a combinação errada.
      if (!(await temRestricao(db, 'papel', 'papel_escopo_empresa_chk'))) {
        await db.rawQuery(
          `ALTER TABLE papel
             ADD CONSTRAINT papel_escopo_empresa_chk
             CHECK (
               (escopo = 'empresa' AND empresa_id IS NOT NULL)
               OR (escopo <> 'empresa' AND empresa_id IS NULL)
             )`
        )
      }
    })
  }

  /** Guardado pelas mesmas perguntas, e pela mesma razão: um `down` que rebente a
   *  meio deixa a tabela num estado que o `up` seguinte não sabe ler. */
  async down() {
    this.defer(async (db) => {
      if (await temRestricao(db, 'papel', 'papel_escopo_empresa_chk')) {
        await db.rawQuery('ALTER TABLE papel DROP CONSTRAINT papel_escopo_empresa_chk')
      }

      if (await temRestricao(db, 'papel', 'papel_empresa_id_foreign')) {
        await db.rawQuery('ALTER TABLE papel DROP FOREIGN KEY papel_empresa_id_foreign')
      }

      if (await temColuna(db, 'papel', 'empresa_id')) {
        await db.rawQuery('ALTER TABLE papel DROP COLUMN empresa_id')
      }

      if (await temColuna(db, 'papel', 'escopo')) {
        await db.rawQuery('ALTER TABLE papel DROP COLUMN escopo')
      }

      // Só volta a ser possível depois de o backfill ter sido revertido — com
      // papéis clonados por empresa há nomes repetidos, e a unicidade global
      // rebentaria. Ver a migração do backfill.
      if (!(await temIndice(db, 'papel', 'papel_nome_unique'))) {
        await db.rawQuery('CREATE UNIQUE INDEX papel_nome_unique ON papel (nome)')
      }
    })
  }
}
