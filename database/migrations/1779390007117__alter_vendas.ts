import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'vendas'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('cliente_online_id').nullable()
      table.uuid('cliente_presencial_id').nullable()

      table
        .foreign('cliente_presencial_id')
        .references('id')
        .inTable('cliente')
        .onDelete('SET NULL')

      table
        .foreign('cliente_online_id')
        .references('id')
        .inTable('user')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => { })
  }
}
