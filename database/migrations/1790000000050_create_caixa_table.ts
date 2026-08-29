import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'caixa'

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
          table.uuid('user_id').nullable()
          table.dateTime('data_fecho').nullable()
          table.decimal('valor_inicial', 22, 2).nullable().defaultTo(0.00)
          table.decimal('total_vendas', 22, 2).nullable().defaultTo(0.00)
          table.enum('status', ['Aberto', 'Fechado']).nullable().defaultTo('Aberto')
          table.string('observacoes', 255).nullable()
          table.decimal('total_caixa', 22, 2).nullable()
          table.uuid('pos_id').nullable()
          table.uuid('empresa_id').nullable()
          table.integer('numero').nullable()
          table.primary(['id'])
          table.index(['deleted_at'], 'caixa_deleted_at_index')
          table.unique(['empresa_id', 'numero'], { indexName: 'caixa_empresa_id_numero_unique' })
          table
            .foreign(['empresa_id'], 'caixa_empresa_id_foreign')
            .references(['id'])
            .inTable('empresa')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
          table
            .foreign(['pos_id'], 'caixa_pos_id_foreign')
            .references(['id'])
            .inTable('pos')
            .onDelete('SET NULL')
            .onUpdate('NO ACTION')
          table
            .foreign(['user_id'], 'caixa_user_id_foreign')
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
