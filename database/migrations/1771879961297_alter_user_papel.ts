import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_papel'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('user_id')
      table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
      table.uuid('papel_id')
      table.foreign('papel_id').references('id').inTable('papel').onDelete('CASCADE')

      table.unique(['user_id', 'papel_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
