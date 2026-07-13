import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'permissao'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('nome').unique()
      table.string('descricao')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
