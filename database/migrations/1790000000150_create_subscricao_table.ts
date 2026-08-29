import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'subscricao'

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
          table.uuid('cliente_id').nullable()
          table.uuid('plano_id').nullable()
          table.enum('status', ['ATIVA', 'CANCELADA', 'EXPIRADA', 'SUSPENSA']).nullable()
          table.date('data_inicio').nullable()
          table.date('data_fim').nullable()
          table.boolean('renova').nullable()
          table.date('cancelada_em').nullable()
          table.primary(['id'])
          table.index(['deleted_at'], 'subscricao_deleted_at_index')
          table
            .foreign(['cliente_id'], 'subscricao_cliente_id_foreign')
            .references(['id'])
            .inTable('empresa')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
          table
            .foreign(['plano_id'], 'subscricao_plano_id_foreign')
            .references(['id'])
            .inTable('plano')
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
