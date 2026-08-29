import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela, temRestricao, temGatilho } from '../helpers/esquema.js'

export default class extends BaseSchema {
  protected tableName = 'papel'

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
          table.string('nome', 255).notNullable()
          table.string('descricao', 255).nullable()
          table.uuid('empresa_id').nullable()
          table.enum('escopo', ['plataforma', 'modelo', 'empresa']).notNullable().defaultTo('modelo')
          table.string('chave_escopo', 64).nullable()
          table.primary(['id'])
          table.index(['deleted_at'], 'papel_deleted_at_index')
          table.unique(['chave_escopo', 'nome'], { indexName: 'papel_escopo_nome_unique' })
          table
            .foreign(['empresa_id'], 'papel_empresa_id_foreign')
            .references(['id'])
            .inTable('empresa')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
        })
      }

      if (!(await temRestricao(db, this.tableName, 'papel_escopo_empresa_chk'))) {
        await db.rawQuery(
          `ALTER TABLE \`papel\` ADD CONSTRAINT \`papel_escopo_empresa_chk\` CHECK (((\`escopo\` = _utf8mb4'empresa') and (\`empresa_id\` is not null)) or ((\`escopo\` <> _utf8mb4'empresa') and (\`empresa_id\` is null)))`
        )
      }

      if (!(await temGatilho(db, 'papel_chave_escopo_bi'))) {
        try {
          await db.rawQuery(
            `CREATE TRIGGER \`papel_chave_escopo_bi\` BEFORE INSERT ON \`papel\` FOR EACH ROW SET NEW.chave_escopo = COALESCE(NEW.empresa_id, NEW.escopo)`
          )
        } catch (erro: any) {
          console.warn(
            `[migração] não foi possível criar o gatilho papel_chave_escopo_bi: ${erro?.sqlMessage ?? erro?.message}\n` +
              '  A aplicação preenche esta coluna por si, por isso NÃO impede o funcionamento.\n' +
              '  Fica sem cobertura quem escreva na tabela por fora (o taesic-backoffice-api,\n' +
              '  SQL à mão). Para corrigir, conforme o erro acima:\n' +
              '    · "SUPER privilege ... binary logging" (1419) -> log_bin_trust_function_creators = 1\n' +
              '    · "command denied ... TRIGGER" (1142) -> GRANT TRIGGER ao utilizador da BD.\n' +
              '  Depois, voltar a correr esta migração (é idempotente).'
          )
        }
      }

      if (!(await temGatilho(db, 'papel_chave_escopo_bu'))) {
        try {
          await db.rawQuery(
            `CREATE TRIGGER \`papel_chave_escopo_bu\` BEFORE UPDATE ON \`papel\` FOR EACH ROW SET NEW.chave_escopo = COALESCE(NEW.empresa_id, NEW.escopo)`
          )
        } catch (erro: any) {
          console.warn(
            `[migração] não foi possível criar o gatilho papel_chave_escopo_bu: ${erro?.sqlMessage ?? erro?.message}\n` +
              '  A aplicação preenche esta coluna por si, por isso NÃO impede o funcionamento.\n' +
              '  Fica sem cobertura quem escreva na tabela por fora (o taesic-backoffice-api,\n' +
              '  SQL à mão). Para corrigir, conforme o erro acima:\n' +
              '    · "SUPER privilege ... binary logging" (1419) -> log_bin_trust_function_creators = 1\n' +
              '    · "command denied ... TRIGGER" (1142) -> GRANT TRIGGER ao utilizador da BD.\n' +
              '  Depois, voltar a correr esta migração (é idempotente).'
          )
        }
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
