import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'userpos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('user_id').nullable()
      table.uuid('pos_id').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'userpos_deleted_at_index')
      table.index(['pos_id'], 'userpos_pos_id_index')
      table.unique(['user_id', 'pos_id'], { indexName: 'userpos_user_id_pos_id_unique' })
      table
        .foreign(['pos_id'], 'userpos_pos_id_foreign')
        .references(['id'])
        .inTable('pos')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['user_id'], 'userpos_user_id_foreign')
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
