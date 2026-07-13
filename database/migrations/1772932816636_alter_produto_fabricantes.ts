import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produto_fabricantes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('nome')
      table.string('email')
      table.string('telefone')
      table.string('endereco')
      table.uuid('empresa_id').nullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')
      table.unique(['nome', 'empresa_id'])
      table.unique(['email', 'empresa_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
