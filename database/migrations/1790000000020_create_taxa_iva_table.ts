import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'taxa_iva'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.string('nome', 255).notNullable()
      table.decimal('percentual', 22, 2).notNullable()
      table.boolean('ativo').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'taxa_iva_deleted_at_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
