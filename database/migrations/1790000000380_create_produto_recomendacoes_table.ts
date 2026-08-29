import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produto_recomendacoes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('produto_id').nullable()
      table.string('recomendacao', 255).nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'produto_recomendacoes_deleted_at_index')
      table
        .foreign(['produto_id'], 'produto_recomendacoes_produto_id_foreign')
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
