import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'caixa'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('total_caixa', 10, 2)
      table.uuid('pos_id')
      table.foreign('pos_id').references('id').inTable('pos').onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
