import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produto_fabricantes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.string('nome', 255).nullable()
      table.string('email', 255).nullable()
      table.string('telefone', 255).nullable()
      table.string('endereco', 255).nullable()
      table.uuid('empresa_id').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'produto_fabricantes_deleted_at_index')
      table.unique(['email', 'empresa_id'], { indexName: 'produto_fabricantes_email_empresa_id_unique' })
      table.unique(['nome', 'empresa_id'], { indexName: 'produto_fabricantes_nome_empresa_id_unique' })
      table
        .foreign(['empresa_id'], 'produto_fabricantes_empresa_id_foreign')
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
