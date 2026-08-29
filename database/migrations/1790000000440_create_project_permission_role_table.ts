import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'project_permission_role'

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
          table.uuid('project_permission_id').nullable()
          table.uuid('project_role_id').nullable()
          table.primary(['id'])
          table.index(['deleted_at'], 'project_permission_role_deleted_at_index')
          table
            .foreign(['project_permission_id'], 'project_permission_role_project_permission_id_foreign')
            .references(['id'])
            .inTable('project_permission')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
          table
            .foreign(['project_role_id'], 'project_permission_role_project_role_id_foreign')
            .references(['id'])
            .inTable('project_role')
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
