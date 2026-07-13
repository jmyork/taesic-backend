import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'promotor_access_token'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()

      table.uuid('promotor_id').notNullable()
      table.foreign('promotor_id').references('id').inTable('promotor').onDelete('CASCADE')

      // Emitido depois de confirmar o OTP — autentica os pedidos ao painel do promotor.
      // Guardado como hash, o valor em claro só é devolvido uma vez ao cliente na confirmação.
      table.string('token_hash').notNullable().unique()
      table.timestamp('expires_at').notNullable()

      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
