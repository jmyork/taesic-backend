import { BaseSchema } from '@adonisjs/lucid/schema'

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

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('empresa_id').nullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')

      // Omitido, um papel nasce `modelo`: não é atribuível a utilizadores e não é
      // de plataforma. Se algum caminho de código se esquecer de o definir, o que
      // sai é inofensivo — e é isso que se quer de um valor por omissão numa
      // fronteira de acesso.
      table.enum('escopo', ['plataforma', 'modelo', 'empresa']).notNullable().defaultTo('modelo')

      // A unicidade global do nome é o que impedia dois inquilinos de terem, cada
      // um, o seu "Vendedor".
      table.dropUnique(['nome'])
    })

    // Coluna gerada e índice em SQL directo: o knex não os expõe.
    //
    // VIRTUAL, não STORED — e não é indiferente. Uma coluna gerada STORED obriga
    // o InnoDB a reconstruir a tabela (ALGORITHM=COPY), e essa reconstrução falha
    // com `ER_CANNOT_ADD_FOREIGN` numa tabela envolvida em chaves estrangeiras:
    // `papel.empresa_id` acabou de ganhar uma, e `user_papel.papel_id` e
    // `papel_permissao.papel_id` apontam para cá. Apanhado a correr esta migração,
    // não por leitura: a versão STORED deixou o DDL a meio (o MySQL não faz DDL
    // transaccional, portanto as colunas ficaram e a migração não ficou registada).
    //
    // VIRTUAL não reconstrói a tabela e o MySQL 8 aceita um índice único sobre ela
    // — o índice materializa o valor, que é tudo o que aqui é preciso.
    this.schema.raw(
      `ALTER TABLE papel
         ADD COLUMN chave_escopo VARCHAR(64)
         GENERATED ALWAYS AS (COALESCE(empresa_id, escopo)) VIRTUAL`
    )
    this.schema.raw(`CREATE UNIQUE INDEX papel_escopo_nome_unique ON papel (chave_escopo, nome)`)

    // O invariante deixa de depender de nenhum programador o respeitar: um papel
    // de empresa TEM empresa, um de plataforma ou modelo NÃO tem. Nenhum caminho
    // de código consegue gravar a combinação errada.
    this.schema.raw(
      `ALTER TABLE papel
         ADD CONSTRAINT papel_escopo_empresa_chk
         CHECK (
           (escopo = 'empresa' AND empresa_id IS NOT NULL)
           OR (escopo <> 'empresa' AND empresa_id IS NULL)
         )`
    )
  }

  async down() {
    this.schema.raw(`ALTER TABLE papel DROP CONSTRAINT papel_escopo_empresa_chk`)
    this.schema.raw(`DROP INDEX papel_escopo_nome_unique ON papel`)
    this.schema.raw(`ALTER TABLE papel DROP COLUMN chave_escopo`)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['empresa_id'])
      table.dropColumn('empresa_id')
      table.dropColumn('escopo')
      // Só volta a ser possível depois de o backfill ter sido revertido — com
      // papéis clonados por empresa há nomes repetidos, e a unicidade global
      // rebentaria. Ver a migração do backfill.
      table.unique(['nome'])
    })
  }
}
