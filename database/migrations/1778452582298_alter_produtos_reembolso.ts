import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produtos_reembolso'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('venda_item_id')
      table.foreign('venda_item_id').references('id').inTable('venda_itens').onDelete('CASCADE')
      table.uuid('user_id')
      table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
      table.integer('quantidade')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => { })
  }
}
