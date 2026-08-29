import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'nif_consulta'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.string('nif', 255).notNullable()
      table.boolean('found').notNullable().defaultTo(false)
      table.string('nome', 255).nullable()
      table.string('tipo', 255).nullable()
      table.string('estado', 255).nullable()
      table.string('inadimplente', 255).nullable()
      table.string('regime_iva', 255).nullable()
      table.text('raw').nullable()
      table.timestamp('consultado_em').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.primary(['id'])
      table.unique(['nif'], { indexName: 'nif_consulta_nif_unique' })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
