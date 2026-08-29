import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'factura'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.uuid('empresa_id').notNullable()
      table.uuid('venda_id').notNullable()
      table.integer('numero').notNullable()
      table.enum('tipo', ['Factura', 'Factura-Recibo', 'Nota de Crédito', 'Nota de Débito']).notNullable()
      table.enum('status', ['emitida', 'anulada']).notNullable().defaultTo('emitida')
      table.string('cliente_nome', 255).nullable()
      table.string('cliente_nif', 255).nullable()
      table.decimal('total', 22, 2).notNullable()
      table.timestamp('data_emissao').notNullable()
      table.text('observacoes').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'factura_deleted_at_index')
      table.unique(['empresa_id', 'numero'], { indexName: 'factura_empresa_id_numero_unique' })
      table
        .foreign(['empresa_id'], 'factura_empresa_id_foreign')
        .references(['id'])
        .inTable('empresa')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['venda_id'], 'factura_venda_id_foreign')
        .references(['id'])
        .inTable('vendas')
        .onDelete('RESTRICT')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
