import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pos'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('nome').unique()
      table.string('localizacao')
      table.string('contacto')
      table.string('email')
      table.uuid('empresa_id')
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
