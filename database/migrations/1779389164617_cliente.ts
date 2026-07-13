import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema {
  protected tableName = 'cliente'
  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable().index()
    })
  }
  async down() {
    this.schema.dropTable(this.tableName)
  }
}
