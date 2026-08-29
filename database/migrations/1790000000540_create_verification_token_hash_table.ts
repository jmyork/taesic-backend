import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'verification_token_hash'

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
          table.uuid('empresa_id').nullable()
          table.string('verification_token_public', 255).nullable()
          table.string('verification_token_hash', 255).nullable()
          table.dateTime('verification_token_expires_at').nullable()
          table.boolean('verified').nullable().defaultTo(false)
          table.enum('purpose', ['account_activation', 'account_activation_reply_token', 'password_recovery']).nullable().defaultTo('password_recovery')
          table.primary(['id'])
          table.index(['deleted_at'], 'verification_token_hash_deleted_at_index')
          table.unique(['verification_token_public'], { indexName: 'verification_token_hash_verification_token_public_unique' })
          table
            .foreign(['empresa_id'], 'verification_token_hash_empresa_id_foreign')
            .references(['id'])
            .inTable('empresa')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
          table
            .foreign(['user_id'], 'verification_token_hash_user_id_foreign')
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
