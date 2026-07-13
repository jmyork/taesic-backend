import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'caixa'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('user_id')
      table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
      // table.datetime('data_abertura')
      table.datetime('data_fecho').nullable()
      table.decimal('valor_inicial').defaultTo(0)
      table.decimal('total_vendas').defaultTo(0)
      table.enum('status', ['Aberto', 'Fechado']).defaultTo('Aberto')
      table.string('observacoes').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
