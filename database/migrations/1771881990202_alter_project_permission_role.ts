import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'project_permission_role'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('project_permission_id')
      table
        .foreign('project_permission_id')
        .references('id')
        .inTable('project_permission')
        .onDelete('CASCADE')
      table.uuid('project_role_id')
      table.foreign('project_role_id').references('id').inTable('project_role').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
