import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'papel'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('nome').notNullable().unique()
      table.string('descricao')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
