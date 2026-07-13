import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'userpos'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('user_id').unique()
      table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
      table.uuid('pos_id').unique()
      table.foreign('pos_id').references('id').inTable('pos').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
