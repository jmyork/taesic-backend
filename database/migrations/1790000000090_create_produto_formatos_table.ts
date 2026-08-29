import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produto_formatos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.string('nome', 255).nullable()
      table.string('descricao', 255).nullable()
      table.uuid('empresa_id').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'produto_formatos_deleted_at_index')
      table.unique(['nome', 'empresa_id'], { indexName: 'produto_formatos_nome_empresa_id_unique' })
      table
        .foreign(['empresa_id'], 'produto_formatos_empresa_id_foreign')
        .references(['id'])
        .inTable('empresa')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
