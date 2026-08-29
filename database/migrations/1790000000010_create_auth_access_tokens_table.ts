import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'auth_access_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.uuid('tokenable_id').notNullable()
      table.string('type', 255).notNullable()
      table.string('name', 255).nullable()
      table.string('hash', 255).notNullable()
      table.text('abilities').notNullable()
      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').nullable()
      table
        .foreign(['tokenable_id'], 'auth_access_tokens_tokenable_id_foreign')
        .references(['id'])
        .inTable('user')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
