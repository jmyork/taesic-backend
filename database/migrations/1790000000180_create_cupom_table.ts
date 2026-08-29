import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'cupom'

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
          table.decimal('desconto', 22, 2).nullable()
          table.dateTime('validade').nullable()
          table.uuid('empresa_id').nullable()
          table.string('codigo', 255).notNullable()
          table.uuid('promotor_id').notNullable()
          table.integer('numero').notNullable()
          table.primary(['id'])
          table.unique(['codigo'], { indexName: 'cupom_codigo_unique' })
          table.index(['deleted_at'], 'cupom_deleted_at_index')
          table.unique(['empresa_id', 'numero'], { indexName: 'cupom_empresa_id_numero_unique' })
          table
            .foreign(['empresa_id'], 'cupom_empresa_id_foreign')
            .references(['id'])
            .inTable('empresa')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
          table
            .foreign(['promotor_id'], 'cupom_promotor_id_foreign')
            .references(['id'])
            .inTable('promotor')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
          table
            .foreign(['user_id'], 'cupom_user_id_foreign')
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
