import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'promotor'

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
          table.string('nome', 255).notNullable()
          table.string('email', 255).notNullable()
          table.string('telefone', 255).nullable()
          table.uuid('empresa_id').nullable()
          table.string('codigo_perfil', 255).notNullable()
          table.boolean('ativo').notNullable().defaultTo(true)
          table.timestamp('created_at').notNullable().defaultTo(this.now())
          table.timestamp('updated_at').notNullable().defaultTo(this.now())
          table.timestamp('deleted_at').nullable()
          table.primary(['id'])
          table.unique(['codigo_perfil'], { indexName: 'promotor_codigo_perfil_unique' })
          table.index(['deleted_at'], 'promotor_deleted_at_index')
          table.unique(['email'], { indexName: 'promotor_email_unique' })
          table
            .foreign(['empresa_id'], 'promotor_empresa_id_foreign')
            .references(['id'])
            .inTable('empresa')
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
