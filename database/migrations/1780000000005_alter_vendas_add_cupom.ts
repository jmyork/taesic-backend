import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'vendas'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('cupom_id').nullable()
      table.foreign('cupom_id').references('id').inTable('cupom').onDelete('SET NULL')

      // Snapshot do valor efetivamente descontado no momento da venda — nunca recalculado a
      // partir de `cupom.desconto` depois (o cupão pode mudar ou expirar; a venda tem de manter
      // o que realmente aconteceu, o mesmo princípio já usado no snapshot de cliente da factura).
      table.decimal('valor_desconto', 12, 2).notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['cupom_id'])
      table.dropColumn('cupom_id')
      table.dropColumn('valor_desconto')
    })
  }
}
