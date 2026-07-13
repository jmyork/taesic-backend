import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'project_user'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('project_id')
      table.foreign('project_id').references('id').inTable('project').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
