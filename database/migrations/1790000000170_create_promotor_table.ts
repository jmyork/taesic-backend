import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'promotor'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.string('nome', 255).notNullable()
      table.string('email', 255).notNullable()
      table.string('telefone', 255).nullable()
      table.uuid('empresa_id').nullable()
      table.string('codigo_perfil', 255).notNullable()
      table.boolean('ativo').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.primary(['id'])
      table.unique(['codigo_perfil'], { indexName: 'promotor_codigo_perfil_unique' })
      table.index(['deleted_at'], 'promotor_deleted_at_index')
      table.unique(['email'], { indexName: 'promotor_email_unique' })
      table
        .foreign(['empresa_id'], 'promotor_empresa_id_foreign')
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
