import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'promotor_otp'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.uuid('promotor_id').notNullable()
      table.string('codigo_hash', 255).notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('used_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.primary(['id'])
      table
        .foreign(['promotor_id'], 'promotor_otp_promotor_id_foreign')
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
