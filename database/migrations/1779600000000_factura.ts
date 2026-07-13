import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'factura'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()

      table.uuid('empresa_id').notNullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')

      table.uuid('venda_id').notNullable()
      table.foreign('venda_id').references('id').inTable('vendas').onDelete('RESTRICT')

      // Sequencial por empresa (nunca global) — garante numeração fiscal contínua por tenant.
      // A unicidade (empresa_id, numero) é reforçada aqui e também no lock aplicativo em
      // factura_repository.ts (o mesmo padrão já usado para a race condition de stock).
      table.integer('numero').notNullable()
      table.unique(['empresa_id', 'numero'])

      table.enum('tipo', ['Factura', 'Factura-Recibo', 'Nota de Crédito', 'Nota de Débito']).notNullable()
      table.enum('status', ['emitida', 'anulada']).notNullable().defaultTo('emitida')

      // Snapshot do cliente no momento da emissão — nunca um join ao vivo: os dados do
      // cliente podem mudar depois, mas a factura tem de refletir o que era verdade quando
      // foi emitida.
      table.string('cliente_nome').nullable()
      table.string('cliente_nif').nullable()

      table.decimal('total', 12, 2).notNullable()
      table.timestamp('data_emissao').notNullable()
      table.text('observacoes').nullable()

      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable().index()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
