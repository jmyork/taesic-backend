import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'venda_itens'

  /**
   * Re-executável: cada passo pergunta antes de fazer. Ver
   * `database/helpers/esquema.ts` para o porquê de isto não ser opcional — o MySQL
   * não faz DDL transaccional, portanto uma migração que falhe a meio deixa o
   * esquema meio alterado E por registar, e a corrida seguinte bate na mesma
   * instrução para sempre.
   */
  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) {
        await db.schema.createTable(this.tableName, (table) => {
          table.uuid('id').notNullable()
          table.timestamp('created_at').notNullable().defaultTo(this.now())
          table.timestamp('updated_at').notNullable().defaultTo(this.now())
          table.timestamp('deleted_at').nullable()
          table.uuid('venda_id').notNullable()
          table.uuid('lote_produto_id').notNullable()
          table.integer('quantidade').notNullable()
          table.decimal('preco_unitario', 22, 2).notNullable()
          table.decimal('desconto', 22, 2).notNullable().defaultTo(0.00)
          table.decimal('total', 22, 2).notNullable()
          table.boolean('reembolsado').notNullable().defaultTo(false)
          table.integer('quantidade_reembolsada').notNullable().defaultTo(0)
          table.primary(['id'])
          table.index(['deleted_at'], 'venda_itens_deleted_at_index')
          table.index(['lote_produto_id'], 'venda_itens_lote_produto_id_index')
          table.index(['venda_id'], 'venda_itens_venda_id_index')
          table
            .foreign(['lote_produto_id'], 'venda_itens_lote_produto_id_foreign')
            .references(['id'])
            .inTable('lote_produto')
            .onDelete('RESTRICT')
            .onUpdate('NO ACTION')
          table
            .foreign(['venda_id'], 'venda_itens_venda_id_foreign')
            .references(['id'])
            .inTable('vendas')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
        })
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (await temTabela(db, this.tableName)) {
        await db.schema.dropTable(this.tableName)
      }
    })
  }
}
