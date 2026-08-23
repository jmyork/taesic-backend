import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Suspender uma empresa passa a ser possível — e a significar alguma coisa.
 *
 * Até aqui não havia forma de cortar o acesso a um inquilino. `ValidateCompanyAlias
 * Middleware` verificava o alias, o dono e o `verified`, e mais nada. Um botão
 * "suspender" no backoffice seria decorativo: uma empresa comprometida, em dívida,
 * ou registada com o NIF de outra pessoa continuava a facturar até alguém ir à
 * base de dados à mão.
 *
 * ── Porquê colunas novas, e não `status`/`inadiplente` ─────────────────────────
 *
 * As duas já existem e é precisamente esse o problema: são booleans sem semântica
 * escrita em lado nenhum. `status` significa "activa"? "aprovada"? "a pagar"?
 * Ninguém sabe, e há 2 empresas em dev e um número desconhecido em produção com
 * valores gravados sob a interpretação de quem os escreveu na altura. Dar-lhes
 * agora um significado numa FRONTEIRA DE ACESSO seria decidir, retroactivamente,
 * quem fica de fora — a partir de dados que nunca quiseram dizer isso.
 *
 * `suspensa_em` não tem esse passado. NULL é "não suspensa" para toda a gente,
 * incluindo para as linhas que já existem, e nenhum comportamento actual muda de
 * sentido por baixo de código que já depende de `status`/`inadiplente`.
 *
 * ── O invariante ───────────────────────────────────────────────────────────────
 *
 * Uma suspensão sem motivo é uma suspensão que ninguém consegue explicar nem
 * reverter com confiança três meses depois. O CHECK garante que as duas colunas
 * andam juntas: ou a empresa está activa (tudo NULL), ou está suspensa e há um
 * motivo gravado. `suspensa_por` fica de fora do invariante de propósito — uma
 * suspensão feita por um comando ace ou por uma rotina automática não tem
 * utilizador para apontar, e recusá-la por isso seria pior.
 */
export default class extends BaseSchema {
  protected tableName = 'empresa'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('suspensa_em').nullable().index()
      table.string('suspensa_motivo', 255).nullable()

      // Quem carregou no botão. `SET NULL` e não `CASCADE`: apagar o administrador
      // que suspendeu não pode reactivar a empresa que ele suspendeu.
      table.uuid('suspensa_por').nullable()
      table.foreign('suspensa_por').references('id').inTable('user').onDelete('SET NULL')
    })

    this.schema.raw(
      `ALTER TABLE empresa
         ADD CONSTRAINT empresa_suspensao_chk
         CHECK (
           (suspensa_em IS NULL AND suspensa_motivo IS NULL)
           OR (suspensa_em IS NOT NULL AND suspensa_motivo IS NOT NULL)
         )`
    )
  }

  async down() {
    this.schema.raw(`ALTER TABLE empresa DROP CONSTRAINT empresa_suspensao_chk`)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['suspensa_por'])
      table.dropColumn('suspensa_por')
      table.dropColumn('suspensa_motivo')
      table.dropColumn('suspensa_em')
    })
  }
}
