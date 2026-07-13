import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cobranca'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('subscricao_id')
      table.foreign('subscricao_id').references('id').inTable('subscricao').onDelete('CASCADE')
      table.decimal('valor')
      table.string('moeda')
      table.enum('status', ['PENDENTE', 'PAGA', 'FALHADA', 'ATRASADA'])
      // table.datetime('data_emissao');
      table.datetime('data_vencimento').nullable()
      table.boolean('pago').nullable()
      table.string('referencia').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
