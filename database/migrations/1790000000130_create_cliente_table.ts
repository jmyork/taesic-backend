import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'cliente'

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
          table.enum('tipo', ['Pessoa Física', 'Pessoa Jurídica']).nullable()
          table.string('nome', 255).nullable()
          table.string('razao_social', 255).nullable()
          table.string('email', 255).nullable()
          table.string('telefone', 255).nullable()
          table.string('telefone_secundario', 255).nullable()
          table.string('nif', 255).nullable()
          table.string('numero_registro', 255).nullable()
          table.date('data_nascimento').nullable()
          table.enum('genero', ['Masculino', 'Feminino']).nullable()
          table.enum('estado_civil', ['Solteiro', 'Casado', 'Divorciado', 'Viúvo']).nullable()
          table.string('profissao', 255).nullable()
          table.string('website', 255).nullable()
          table.string('endereco', 255).nullable()
          table.string('bairro', 255).nullable()
          table.string('cidade', 255).nullable()
          table.string('provincia', 255).nullable()
          table.string('pais', 255).nullable()
          table.string('codigo_postal', 255).nullable()
          table.boolean('ativo').nullable()
          table.decimal('limite_credito', 22, 2).nullable()
          table.decimal('saldo', 22, 2).nullable()
          table.string('observacao', 255).nullable()
          table.string('logo', 255).nullable()
          table.string('foto', 255).nullable()
          table.uuid('cliente_pai_id').nullable()
          table.uuid('empresa_id').nullable()
          table.string('nome_fantasia', 255).nullable()
          table.integer('numero').nullable()
          table.primary(['id'])
          table.index(['deleted_at'], 'cliente_deleted_at_index')
          table.index(['empresa_id'], 'cliente_empresa_id_index')
          table.unique(['empresa_id', 'numero'], { indexName: 'cliente_empresa_id_numero_unique' })
          table
            .foreign(['cliente_pai_id'], 'cliente_cliente_pai_id_foreign')
            .references(['id'])
            .inTable('cliente')
            .onDelete('SET NULL')
            .onUpdate('NO ACTION')
          table
            .foreign(['empresa_id'], 'cliente_empresa_id_foreign')
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
