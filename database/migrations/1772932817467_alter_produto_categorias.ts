import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produto_categorias'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('nome')
      table.string('descricao')
      table.uuid('empresa_id').nullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')
      table.unique(['nome', 'empresa_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
