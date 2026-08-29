import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'project_user'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.string('username', 255).nullable()
      table.string('email', 255).nullable()
      table.string('password', 255).nullable()
      table.uuid('project_id').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'project_user_deleted_at_index')
      table
        .foreign(['project_id'], 'project_user_project_id_foreign')
        .references(['id'])
        .inTable('project')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
