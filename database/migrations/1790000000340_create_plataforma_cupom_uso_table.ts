import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'plataforma_cupom_uso'

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
          table.uuid('cupom_id').notNullable()
          table.uuid('subscricao_id').notNullable()
          table.uuid('empresa_id').notNullable()
          table.decimal('valor_base', 12, 2).notNullable().defaultTo(0.00)
          table.decimal('valor_desconto', 12, 2).notNullable().defaultTo(0.00)
          table.decimal('valor_comissao', 12, 2).notNullable().defaultTo(0.00)
          table.string('moeda', 8).notNullable().defaultTo('AOA')
          table.uuid('registado_por').nullable()
          table.dateTime('created_at').notNullable()
          table.dateTime('updated_at').notNullable()
          table.dateTime('deleted_at').nullable()
          table.primary(['id'])
          table.index(['cupom_id'], 'plataforma_cupom_uso_cupom_id_index')
          table.unique(['subscricao_id'], { indexName: 'plataforma_cupom_uso_subscricao_unique' })
          table
            .foreign(['cupom_id'], 'plataforma_cupom_uso_cupom_id_foreign')
            .references(['id'])
            .inTable('plataforma_cupom')
            .onDelete('NO ACTION')
            .onUpdate('NO ACTION')
          table
            .foreign(['empresa_id'], 'plataforma_cupom_uso_empresa_id_foreign')
            .references(['id'])
            .inTable('empresa')
            .onDelete('NO ACTION')
            .onUpdate('NO ACTION')
          table
            .foreign(['registado_por'], 'plataforma_cupom_uso_registado_por_foreign')
            .references(['id'])
            .inTable('user')
            .onDelete('NO ACTION')
            .onUpdate('NO ACTION')
          table
            .foreign(['subscricao_id'], 'plataforma_cupom_uso_subscricao_id_foreign')
            .references(['id'])
            .inTable('subscricao')
            .onDelete('NO ACTION')
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
