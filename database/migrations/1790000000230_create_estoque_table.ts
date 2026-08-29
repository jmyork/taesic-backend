import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'estoque'

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
          table.uuid('lote_produto_id').nullable()
          table.integer('quantidade').unsigned().nullable()
          table.enum('tipo_movimentacao', ['entrada', 'saida', 'ajuste', 'transferencia', 'ajuste_negativo', 'ajuste_positivo', 'transferencia_saida', 'transferencia_entrada']).nullable()
          table.string('motivo', 255).nullable().defaultTo('entrada')
          table.uuid('registrado_por').nullable()
          table.uuid('pos_id').nullable()
          table.primary(['id'])
          table.index(['deleted_at'], 'estoque_deleted_at_index')
          table
            .foreign(['lote_produto_id'], 'estoque_lote_produto_id_foreign')
            .references(['id'])
            .inTable('lote_produto')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
          table
            .foreign(['pos_id'], 'estoque_pos_id_foreign')
            .references(['id'])
            .inTable('pos')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
          table
            .foreign(['registrado_por'], 'estoque_registrado_por_foreign')
            .references(['id'])
            .inTable('user')
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
