import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'metodopagamento'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.string('nome', 255).notNullable()
      table.string('descricao', 255).nullable()
      table.uuid('empresa_id').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'metodopagamento_deleted_at_index')
      table.unique(['empresa_id', 'nome'], { indexName: 'metodopagamento_empresa_id_nome_unique' })
      table
        .foreign(['empresa_id'], 'metodopagamento_empresa_id_foreign')
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
