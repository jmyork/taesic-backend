import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pessoa'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.string('nome', 255).nullable()
      table.string('sobrenome', 255).nullable()
      table.string('email', 255).nullable()
      table.string('telefone', 255).nullable()
      table.string('nif', 255).nullable()
      table.string('img_url', 255).nullable()
      table.date('data_nascimento').nullable()
      table.string('genero', 255).nullable()
      table.string('endereco', 255).nullable()
      table.string('cidade', 255).nullable()
      table.string('pais', 255).nullable()
      table.enum('tipo', ['Cliente', 'Funcionario', 'Promotor']).nullable().defaultTo('Funcionario')
      table.uuid('empresa_id').nullable()
      table.uuid('user_id').nullable()
      table.integer('numero').nullable()
      table.boolean('ativo').notNullable().defaultTo(true)
      table.primary(['id'])
      table.index(['deleted_at'], 'pessoa_deleted_at_index')
      table.unique(['empresa_id', 'numero'], { indexName: 'pessoa_empresa_id_numero_unique' })
      table
        .foreign(['empresa_id'], 'pessoa_empresa_id_foreign')
        .references(['id'])
        .inTable('empresa')
        .onDelete('SET NULL')
        .onUpdate('NO ACTION')
      table
        .foreign(['user_id'], 'pessoa_user_id_foreign')
        .references(['id'])
        .inTable('user')
        .onDelete('SET NULL')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
