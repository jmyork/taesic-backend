import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_papel'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('user_id').nullable()
      table.uuid('papel_id').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'user_papel_deleted_at_index')
      table.unique(['user_id', 'papel_id'], { indexName: 'user_papel_user_id_papel_id_unique' })
      table
        .foreign(['papel_id'], 'user_papel_papel_id_foreign')
        .references(['id'])
        .inTable('papel')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['user_id'], 'user_papel_user_id_foreign')
        .references(['id'])
        .inTable('user')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
