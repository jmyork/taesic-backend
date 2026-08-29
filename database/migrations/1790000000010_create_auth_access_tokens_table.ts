import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'auth_access_tokens'

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
          table.increments('id')
          table.uuid('tokenable_id').notNullable()
          table.string('type', 255).notNullable()
          table.string('name', 255).nullable()
          table.string('hash', 255).notNullable()
          table.text('abilities').notNullable()
          table.timestamp('created_at').nullable()
          table.timestamp('updated_at').nullable()
          table.timestamp('last_used_at').nullable()
          table.timestamp('expires_at').nullable()
          table
            .foreign(['tokenable_id'], 'auth_access_tokens_tokenable_id_foreign')
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
