import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'categorias_produtos'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('produto_id')
      table.foreign('produto_id').references('id').inTable('produtos').onDelete('CASCADE')
      table.uuid('produto_categoria_id')
      table
        .foreign('produto_categoria_id')
        .references('id')
        .inTable('produto_categorias')
        .onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
