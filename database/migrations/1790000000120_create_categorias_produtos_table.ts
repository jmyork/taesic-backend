import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'categorias_produtos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('produto_id').nullable()
      table.uuid('produto_categoria_id').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'categorias_produtos_deleted_at_index')
      table
        .foreign(['produto_categoria_id'], 'categorias_produtos_produto_categoria_id_foreign')
        .references(['id'])
        .inTable('produto_categorias')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['produto_id'], 'categorias_produtos_produto_id_foreign')
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
