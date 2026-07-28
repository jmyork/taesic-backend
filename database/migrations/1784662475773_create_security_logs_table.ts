import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'security_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.string('event', 100).notNullable().index()
      table.string('ip', 45).nullable()
      table.text('details', 'longtext').nullable()
      table.timestamp('created_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
