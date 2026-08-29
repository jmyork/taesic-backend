import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'subscricao'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('cliente_id').nullable()
      table.uuid('plano_id').nullable()
      table.enum('status', ['ATIVA', 'CANCELADA', 'EXPIRADA', 'SUSPENSA']).nullable()
      table.date('data_inicio').nullable()
      table.date('data_fim').nullable()
      table.boolean('renova').nullable()
      table.date('cancelada_em').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'subscricao_deleted_at_index')
      table
        .foreign(['cliente_id'], 'subscricao_cliente_id_foreign')
        .references(['id'])
        .inTable('empresa')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['plano_id'], 'subscricao_plano_id_foreign')
        .references(['id'])
        .inTable('plano')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
