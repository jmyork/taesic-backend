import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'vendapagamento'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('venda_id').nullable()
      table.uuid('metodo_pagamento_id').nullable()
      table.decimal('valor', 22, 2).notNullable()
      table.string('referencia', 255).nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'vendapagamento_deleted_at_index')
      table
        .foreign(['metodo_pagamento_id'], 'vendapagamento_metodo_pagamento_id_foreign')
        .references(['id'])
        .inTable('metodopagamento')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['venda_id'], 'vendapagamento_venda_id_foreign')
        .references(['id'])
        .inTable('vendas')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
