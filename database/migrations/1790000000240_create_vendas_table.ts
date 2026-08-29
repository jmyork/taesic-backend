import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'vendas'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('caixa_id').nullable()
      table.decimal('total', 22, 2).notNullable().defaultTo(0.00)
      table.enum('status', ['aberta', 'fechada', 'cancelada', 'reembolsada', 'proforma']).notNullable().defaultTo('aberta')
      table.string('motivo_cancelamento', 255).nullable()
      table.string('motivo_reembolso', 255).nullable()
      table.enum('venda_tipo', ['presencial', 'online', 'online_loja']).nullable()
      table.uuid('cliente_online_id').nullable()
      table.uuid('cliente_presencial_id').nullable()
      table.uuid('cupom_id').nullable()
      table.decimal('valor_desconto', 22, 2).notNullable().defaultTo(0.00)
      table.uuid('empresa_id').nullable()
      table.integer('numero').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'vendas_deleted_at_index')
      table.unique(['empresa_id', 'numero'], { indexName: 'vendas_empresa_id_numero_unique' })
      table
        .foreign(['caixa_id'], 'vendas_caixa_id_foreign')
        .references(['id'])
        .inTable('caixa')
        .onDelete('SET NULL')
        .onUpdate('NO ACTION')
      table
        .foreign(['cliente_online_id'], 'vendas_cliente_online_id_foreign')
        .references(['id'])
        .inTable('user')
        .onDelete('SET NULL')
        .onUpdate('NO ACTION')
      table
        .foreign(['cliente_presencial_id'], 'vendas_cliente_presencial_id_foreign')
        .references(['id'])
        .inTable('cliente')
        .onDelete('SET NULL')
        .onUpdate('NO ACTION')
      table
        .foreign(['cupom_id'], 'vendas_cupom_id_foreign')
        .references(['id'])
        .inTable('cupom')
        .onDelete('SET NULL')
        .onUpdate('NO ACTION')
      table
        .foreign(['empresa_id'], 'vendas_empresa_id_foreign')
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
