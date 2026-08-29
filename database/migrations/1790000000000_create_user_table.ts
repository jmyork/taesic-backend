import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'user'

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
          table.string('username', 255).nullable()
          table.string('email', 254).notNullable()
          table.string('password', 255).notNullable()
          table.uuid('empresa_id').nullable()
          table.timestamp('created_at').notNullable()
          table.timestamp('updated_at').nullable()
          table.timestamp('deleted_at').nullable()
          table.primary(['id'])
          table.unique(['email', 'empresa_id'], { indexName: 'user_email_empresa_id_unique' })
          table.unique(['username', 'empresa_id'], { indexName: 'user_username_empresa_id_unique' })
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
