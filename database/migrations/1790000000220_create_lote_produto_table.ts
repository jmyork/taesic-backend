import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'lote_produto'

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
          table.uuid('produto_id').nullable()
          table.date('data_validade').nullable()
          table.date('data_fabrico').nullable()
          table.string('lote', 255).nullable()
          table.integer('quantidade_em_estoque').nullable().defaultTo(0)
          table.decimal('preco_venda', 22, 2).nullable()
          table.decimal('preco_compra', 22, 2).nullable()
          table.primary(['id'])
          table.index(['deleted_at'], 'lote_produto_deleted_at_index')
          table
            .foreign(['produto_id'], 'lote_produto_produto_id_foreign')
            .references(['id'])
            .inTable('produtos')
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
