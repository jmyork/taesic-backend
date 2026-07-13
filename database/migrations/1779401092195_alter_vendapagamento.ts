import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'vendapagamento'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('venda_id');
      table.foreign('venda_id').references('id').inTable('vendas').onDelete('CASCADE');
      table.uuid('metodo_pagamento_id');
      table.foreign('metodo_pagamento_id').references('id').inTable('metodopagamento').onDelete('CASCADE');
      table.decimal('valor');
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {
    })
  }
}