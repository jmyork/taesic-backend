import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'venda_itens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('venda_id').notNullable()
      table.uuid('lote_produto_id').notNullable()
      table.integer('quantidade').notNullable()
      table.decimal('preco_unitario', 22, 2).notNullable()
      table.decimal('desconto', 22, 2).notNullable().defaultTo(0.00)
      table.decimal('total', 22, 2).notNullable()
      table.boolean('reembolsado').notNullable().defaultTo(false)
      table.integer('quantidade_reembolsada').notNullable().defaultTo(0)
      table.primary(['id'])
      table.index(['deleted_at'], 'venda_itens_deleted_at_index')
      table.index(['lote_produto_id'], 'venda_itens_lote_produto_id_index')
      table.index(['venda_id'], 'venda_itens_venda_id_index')
      table
        .foreign(['lote_produto_id'], 'venda_itens_lote_produto_id_foreign')
        .references(['id'])
        .inTable('lote_produto')
        .onDelete('RESTRICT')
        .onUpdate('NO ACTION')
      table
        .foreign(['venda_id'], 'venda_itens_venda_id_foreign')
        .references(['id'])
        .inTable('vendas')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
