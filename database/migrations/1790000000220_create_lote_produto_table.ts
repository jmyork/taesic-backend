import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lote_produto'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('produto_id').nullable()
      table.date('data_validade').nullable()
      table.date('data_fabrico').nullable()
      table.string('lote', 255).nullable()
      table.integer('quantidade_em_estoque').nullable().defaultTo(0)
      table.decimal('preco_venda', 22, 2).nullable()
      table.decimal('preco_compra', 22, 2).nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'lote_produto_deleted_at_index')
      table
        .foreign(['produto_id'], 'lote_produto_produto_id_foreign')
        .references(['id'])
        .inTable('produtos')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
