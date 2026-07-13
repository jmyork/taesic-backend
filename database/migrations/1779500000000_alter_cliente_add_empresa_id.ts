import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cliente'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // `cliente` foi criada sem isolamento de tenant. Esta coluna é adicionada como
      // nullable porque não há forma segura de inferir a que empresa pertence cada
      // registo já existente — esse mapeamento tem de ser feito manualmente antes de
      // se poder tornar a coluna obrigatória.
      table.uuid('empresa_id').nullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')
      table.index(['empresa_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['empresa_id'])
      table.dropColumn('empresa_id')
    })
  }
}
