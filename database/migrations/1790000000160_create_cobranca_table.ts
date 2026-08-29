import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cobranca'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('subscricao_id').nullable()
      table.decimal('valor', 22, 2).nullable()
      table.string('moeda', 255).nullable()
      table.enum('status', ['PENDENTE', 'PAGA', 'FALHADA', 'ATRASADA']).nullable()
      table.dateTime('data_vencimento').nullable()
      table.boolean('pago').nullable()
      table.string('referencia', 255).nullable()
      table.dateTime('data_emissao').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'cobranca_deleted_at_index')
      table
        .foreign(['subscricao_id'], 'cobranca_subscricao_id_foreign')
        .references(['id'])
        .inTable('subscricao')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
