import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'despesas'

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
          table.uuid('pos_id').nullable()
          table.string('categoria', 255).notNullable()
          table.string('descricao', 255).nullable()
          table.decimal('valor', 22, 2).notNullable()
          table.date('data_despesa').notNullable()
          table.uuid('registrado_por').notNullable()
          table.timestamp('created_at').notNullable().defaultTo(this.now())
          table.timestamp('updated_at').notNullable().defaultTo(this.now())
          table.timestamp('deleted_at').nullable()
          table.integer('numero').notNullable()
          table.primary(['id'])
          table.index(['deleted_at'], 'despesas_deleted_at_index')
          table.unique(['empresa_id', 'numero'], { indexName: 'despesas_empresa_id_numero_unique' })
          table
            .foreign(['empresa_id'], 'despesas_empresa_id_foreign')
            .references(['id'])
            .inTable('empresa')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
          table
            .foreign(['pos_id'], 'despesas_pos_id_foreign')
            .references(['id'])
            .inTable('pos')
            .onDelete('SET NULL')
            .onUpdate('NO ACTION')
          table
            .foreign(['registrado_por'], 'despesas_registrado_por_foreign')
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
