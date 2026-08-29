import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'nif_consulta'

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
          table.string('nif', 255).notNullable()
          table.boolean('found').notNullable().defaultTo(false)
          table.string('nome', 255).nullable()
          table.string('tipo', 255).nullable()
          table.string('estado', 255).nullable()
          table.string('inadimplente', 255).nullable()
          table.string('regime_iva', 255).nullable()
          table.text('raw').nullable()
          table.timestamp('consultado_em').notNullable()
          table.timestamp('created_at').notNullable()
          table.timestamp('updated_at').notNullable()
          table.primary(['id'])
          table.unique(['nif'], { indexName: 'nif_consulta_nif_unique' })
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
