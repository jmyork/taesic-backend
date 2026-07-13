import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'project_user_role'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('project_user_id')
      table.foreign('project_user_id').references('id').inTable('project_user').onDelete('CASCADE')
      table.uuid('project_role_id')
      table.foreign('project_role_id').references('id').inTable('project_role').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
