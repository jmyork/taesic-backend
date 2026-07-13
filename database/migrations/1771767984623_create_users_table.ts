import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.string('username').nullable()
      table.string('email', 254).notNullable() //.unique()
      table.string('password').notNullable()
      table.uuid('empresa_id').nullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('SET NULL')

      // table.uuid("pos_id").nullable()
      // table.foreign('pos_id').references('id').inTable('pos').onDelete('SET NULL')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.unique(['email', 'empresa_id'])
      table.unique(['username', 'empresa_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
