import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'verification_token_hash'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('user_id').nullable().defaultTo(null)
      table.uuid('empresa_id').nullable().defaultTo(null)
      table.string('verification_token_public').unique()
      table.string('verification_token_hash')
      table.dateTime('verification_token_expires_at')
      table.boolean('verified').defaultTo(false)

      table
        .enu('purpose', [
          'account_activation',
          'account_activation_reply_token',
          'password_recovery',
        ])
        .defaultTo('password_recovery')

      table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['user_id'])
      table.dropForeign(['empresa_id'])
      table.dropColumn('user_id')
      table.dropColumn('empresa_id')
      table.dropColumn('verification_token_public')
      table.dropColumn('verification_token_hash')
      table.dropColumn('verification_token_expires_at')
      table.dropColumn('verified')
    })
  }
}
