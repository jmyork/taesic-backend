import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'permissao'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.string('nome', 255).nullable()
      table.string('descricao', 255).nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'permissao_deleted_at_index')
      table.unique(['nome'], { indexName: 'permissao_nome_unique' })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
