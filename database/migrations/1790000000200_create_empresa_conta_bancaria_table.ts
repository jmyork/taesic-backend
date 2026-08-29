import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'empresa_conta_bancaria'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.string('empresa_id', 255).nullable()
      table.string('conta', 255).nullable()
      table.string('iban', 255).nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'empresa_conta_bancaria_deleted_at_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
