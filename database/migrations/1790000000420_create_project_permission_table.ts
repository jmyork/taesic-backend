import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'project_permission'

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
          table.uuid('project_id').nullable()
          table.string('name', 255).nullable()
          table.string('descricao', 255).nullable()
          table.primary(['id'])
          table.index(['deleted_at'], 'project_permission_deleted_at_index')
          table
            .foreign(['project_id'], 'project_permission_project_id_foreign')
            .references(['id'])
            .inTable('project')
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
