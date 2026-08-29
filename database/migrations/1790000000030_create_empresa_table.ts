import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela, temRestricao } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'empresa'

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
          table.uuid('user_id').nullable()
          table.string('nif', 255).nullable()
          table.enum('tamanho', ['pequena', 'media', 'grande']).nullable()
          table.boolean('status').nullable().defaultTo(true)
          table.boolean('inadiplente').nullable().defaultTo(false)
          table.boolean('regime_iva').nullable().defaultTo(false)
          table.string('company_alias', 255).nullable()
          table.string('localizacao', 255).nullable()
          table.string('contacto', 255).nullable()
          table.boolean('verified').nullable().defaultTo(false)
          table.uuid('taxa_iva_id').nullable()
          table.timestamp('suspensa_em').nullable()
          table.string('suspensa_motivo', 255).nullable()
          table.uuid('suspensa_por').nullable()
          table.string('ramo_actuacao', 64).nullable()
          table.timestamp('onboarding_concluido_em').nullable()
          table.primary(['id'])
          table.unique(['company_alias'], { indexName: 'empresa_company_alias_unique' })
          table.index(['deleted_at'], 'empresa_deleted_at_index')
          table.unique(['nif'], { indexName: 'empresa_nif_unique' })
          table.unique(['nome'], { indexName: 'empresa_nome_unique' })
          table.index(['suspensa_em'], 'empresa_suspensa_em_index')
          table
            .foreign(['suspensa_por'], 'empresa_suspensa_por_foreign')
            .references(['id'])
            .inTable('user')
            .onDelete('SET NULL')
            .onUpdate('NO ACTION')
          table
            .foreign(['taxa_iva_id'], 'empresa_taxa_iva_id_foreign')
            .references(['id'])
            .inTable('taxa_iva')
            .onDelete('SET NULL')
            .onUpdate('NO ACTION')
        })
      }

      if (!(await temRestricao(db, this.tableName, 'empresa_suspensao_chk'))) {
        await db.rawQuery(
          `ALTER TABLE \`empresa\` ADD CONSTRAINT \`empresa_suspensao_chk\` CHECK (((\`suspensa_em\` is null) and (\`suspensa_motivo\` is null)) or ((\`suspensa_em\` is not null) and (\`suspensa_motivo\` is not null)))`
        )
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
