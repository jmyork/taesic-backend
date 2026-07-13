import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'venda_itens'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // table.uuid('venda_id')
      // table.foreign('venda_id').references('id').inTable('vendas').onDelete('CASCADE')
      // table.uuid('lote_produto_id')
      // table.foreign('lote_produto_id').references('id').inTable('lote_produto').onDelete('CASCADE')
      // table.string('quantidade')
      // table.string('preco_unitario')

      table.uuid('venda_id').notNullable().index()
      table.foreign('venda_id').references('id').inTable('vendas').onDelete('CASCADE')

      // table.uuid('produto_id').notNullable().index()
      // table.foreign('produto_id').references('id').inTable('produtos').onDelete('RESTRICT')

      table.uuid('lote_produto_id').notNullable().index()
      table.foreign('lote_produto_id').references('id').inTable('lote_produto').onDelete('RESTRICT')

      // Valores
      table.integer('quantidade').notNullable()
      table.decimal('preco_unitario', 12, 2).notNullable()
      table.decimal('desconto', 12, 2).notNullable().defaultTo(0)
      table.decimal('total', 12, 2).notNullable()

      // Campos de controle
      table.boolean('reembolsado').notNullable().defaultTo(false)
      table.integer('quantidade_reembolsada').notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => { })
  }
}
