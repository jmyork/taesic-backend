import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'empresa_ramo'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.uuid('empresa_id').notNullable()
      table.string('ramo', 64).notNullable()
      table.dateTime('created_at').notNullable()
      table.dateTime('updated_at').notNullable()
      table.primary(['id'])
      table.unique(['empresa_id', 'ramo'], { indexName: 'empresa_ramo_empresa_id_ramo_unique' })
      table
        .foreign(['empresa_id'], 'empresa_ramo_empresa_id_foreign')
        .references(['id'])
        .inTable('empresa')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
