import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lote_produto'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('produto_id')
      table.foreign('produto_id').references('id').inTable('produtos').onDelete('CASCADE')

      table.date('data_validade').nullable()
      table.date('data_fabrico').nullable()

      table.string('lote').nullable()

      table.integer('quantidade_em_estoque').nullable().defaultTo(0)
      table.decimal('preco_venda')
      table
        .decimal('preco_compra')
        .nullable()
        .comment('preço de aquisição do produto ou custo de prestação de serviço')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
