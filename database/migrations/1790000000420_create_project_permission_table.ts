import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'project_permission'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('project_id').nullable()
      table.string('name', 255).nullable()
      table.string('descricao', 255).nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'project_permission_deleted_at_index')
      table
        .foreign(['project_id'], 'project_permission_project_id_foreign')
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
