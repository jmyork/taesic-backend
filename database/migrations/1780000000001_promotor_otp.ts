import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'promotor_otp'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()

      table.uuid('promotor_id').notNullable()
      table.foreign('promotor_id').references('id').inTable('promotor').onDelete('CASCADE')

      // Nunca guardar o código em claro — mesmo padrão de segurança do verification_token_hash.
      table.string('codigo_hash').notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('used_at').nullable()

      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
