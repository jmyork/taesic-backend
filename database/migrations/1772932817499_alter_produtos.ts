import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produtos'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('nome')
      table.string('descricao')
      // -----------------------------------------------------------------
      // Definir se o produto em questão é um serviço. Caso seja.
      // Não é aplicável data de validade e data de fabrico e de validade, preço de compra
      table.boolean('is_service').defaultTo(false)
      // ------------------------------------------------------------------

      table.uuid('fabricante_id').nullable()
      table
        .foreign('fabricante_id')
        .references('id')
        .inTable('produto_fabricantes')
        .onDelete('CASCADE')

      table.uuid('formato_id').nullable()
      table.foreign('formato_id').references('id').inTable('produto_formatos').onDelete('CASCADE')

      table.uuid('empresa_id').nullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')

      table.uuid('marca_id').nullable()
      table.foreign('marca_id').references('id').inTable('marcas').onDelete('CASCADE')

      table.uuid('fornecedor_id').nullable()
      table
        .foreign('fornecedor_id')
        .references('id')
        .inTable('produto_fornecedores')
        .onDelete('CASCADE')

      // Garantir que o nome do produto seja único dentro da mesma empresa

      table.unique(['nome', 'empresa_id']) // Garante que o nome do produto seja único dentro da mesma empresa
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
