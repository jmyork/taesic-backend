import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'factura'

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
