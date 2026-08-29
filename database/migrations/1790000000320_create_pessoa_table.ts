import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'pessoa'

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
          table.string('nome', 255).nullable()
          table.string('sobrenome', 255).nullable()
          table.string('email', 255).nullable()
          table.string('telefone', 255).nullable()
          table.string('nif', 255).nullable()
          table.string('img_url', 255).nullable()
          table.date('data_nascimento').nullable()
          table.string('genero', 255).nullable()
          table.string('endereco', 255).nullable()
          table.string('cidade', 255).nullable()
          table.string('pais', 255).nullable()
          table.enum('tipo', ['Cliente', 'Funcionario', 'Promotor']).nullable().defaultTo('Funcionario')
          table.uuid('empresa_id').nullable()
          table.uuid('user_id').nullable()
          table.integer('numero').nullable()
          table.boolean('ativo').notNullable().defaultTo(true)
          table.primary(['id'])
          table.index(['deleted_at'], 'pessoa_deleted_at_index')
          table.unique(['empresa_id', 'numero'], { indexName: 'pessoa_empresa_id_numero_unique' })
          table
            .foreign(['empresa_id'], 'pessoa_empresa_id_foreign')
            .references(['id'])
            .inTable('empresa')
            .onDelete('SET NULL')
            .onUpdate('NO ACTION')
          table
            .foreign(['user_id'], 'pessoa_user_id_foreign')
            .references(['id'])
            .inTable('user')
            .onDelete('SET NULL')
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
