import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'papel_permissao'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('papel_id').nullable()
      table.uuid('permissao_id').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'papel_permissao_deleted_at_index')
      table.unique(['papel_id', 'permissao_id'], { indexName: 'papel_permissao_papel_id_permissao_id_unique' })
      table
        .foreign(['papel_id'], 'papel_permissao_papel_id_foreign')
        .references(['id'])
        .inTable('papel')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['permissao_id'], 'papel_permissao_permissao_id_foreign')
        .references(['id'])
        .inTable('permissao')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
