import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'papel_permissao'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('papel_id')
      table.foreign('papel_id').references('id').inTable('papel').onDelete('CASCADE')
      table.uuid('permissao_id')
      table.foreign('permissao_id').references('id').inTable('permissao').onDelete('CASCADE')
      table.unique(['papel_id', 'permissao_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
