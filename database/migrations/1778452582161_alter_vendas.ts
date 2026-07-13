import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'vendas'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('caixa_id').nullable()
      table.foreign('caixa_id').references('id').inTable('caixa').onDelete('SET NULL')
      table.decimal('total', 10, 2).notNullable().defaultTo(0)
      table.enum('status', ['aberta', 'fechada', 'cancelada', 'reembolsada']).defaultTo('aberta')
      table.string("motivo_cancelamento").nullable()
      table.string("motivo_reembolso").nullable()
      table.enum('venda_tipo', ['presencial', 'online', 'online_loja'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => { })
  }
}
