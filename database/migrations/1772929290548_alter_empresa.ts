import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'empresa'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('nome').unique()
      table.uuid('user_id')
      table.string('nif')
      table.enum('tamanho',["pequena","media","grande"]).nullable()
      table.boolean('status').defaultTo(true).nullable()
      table.boolean('inadiplente').defaultTo(false).nullable()
      table.boolean('regime_iva').defaultTo(false).nullable()
      table.string('company_alias').unique()
      table.string('localizacao')
      table.string('contacto')
      table.boolean('verified').defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
