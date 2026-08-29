import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'user_papel'

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
          table.uuid('papel_id').nullable()
          table.primary(['id'])
          table.index(['deleted_at'], 'user_papel_deleted_at_index')
          table.unique(['user_id', 'papel_id'], { indexName: 'user_papel_user_id_papel_id_unique' })
          table
            .foreign(['papel_id'], 'user_papel_papel_id_foreign')
            .references(['id'])
            .inTable('papel')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
          table
            .foreign(['user_id'], 'user_papel_user_id_foreign')
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
