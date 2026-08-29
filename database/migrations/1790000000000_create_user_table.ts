import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.string('username', 255).nullable()
      table.string('email', 254).notNullable()
      table.string('password', 255).notNullable()
      table.uuid('empresa_id').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
      table.primary(['id'])
      table.unique(['email', 'empresa_id'], { indexName: 'user_email_empresa_id_unique' })
      table.unique(['username', 'empresa_id'], { indexName: 'user_username_empresa_id_unique' })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
