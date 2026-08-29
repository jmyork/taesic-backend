import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'promotor_access_token'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.uuid('promotor_id').notNullable()
      table.string('token_hash', 255).notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.primary(['id'])
      table.unique(['token_hash'], { indexName: 'promotor_access_token_token_hash_unique' })
      table
        .foreign(['promotor_id'], 'promotor_access_token_promotor_id_foreign')
        .references(['id'])
        .inTable('promotor')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
