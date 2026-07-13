import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'estoque'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('produto_id')

      table.uuid('lote_produto_id')
      table.foreign('lote_produto_id').references('id').inTable('lote_produto').onDelete('CASCADE')

      table.integer('quantidade').unsigned().nullable()
      table.enum('tipo_movimentacao', ['entrada', 'saida', 'ajuste', 'transferencia','ajuste_negativo', 'ajuste_positivo', 'transferencia_saida', 'transferencia_entrada']).nullable()
      
      table.string('motivo').notNullable().defaultTo('entrada').nullable()
      table.uuid('registrado_por')
      table.foreign('registrado_por').references('id').inTable('user').onDelete('CASCADE')
      table.uuid('pos_id').nullable()
      table.foreign('pos_id').references('id').inTable('pos').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
