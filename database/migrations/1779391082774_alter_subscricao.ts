import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'subscricao'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('cliente_id')
      
      table.foreign('cliente_id').references('id').inTable('empresa').onDelete('CASCADE')
      table.uuid('plano_id')

      table.foreign('plano_id').references('id').inTable('plano').onDelete('CASCADE')

      table.enum('status', ['ATIVA', 'CANCELADA', 'EXPIRADA', 'SUSPENSA'])
      
      table.date('data_inicio')
      table.date('data_fim').nullable()
      table.boolean('renova').nullable()
      table.date('cancelada_em').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
