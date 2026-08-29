import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'project_user_role'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('project_user_id').nullable()
      table.uuid('project_role_id').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'project_user_role_deleted_at_index')
      table
        .foreign(['project_role_id'], 'project_user_role_project_role_id_foreign')
        .references(['id'])
        .inTable('project_role')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['project_user_id'], 'project_user_role_project_user_id_foreign')
        .references(['id'])
        .inTable('project_user')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
