import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'nif_consulta'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()

      // Cache GLOBAL, deliberadamente não isolada por empresa: um NIF é um
      // identificador nacional — a resposta do Minfin é a mesma para qualquer tenant.
      // O isolamento faz-se no acesso (rota autenticada por empresa), não nos dados.
      table.string('nif').notNullable().unique()

      // `false` quando o portal respondeu mas não encontrou o contribuinte. Guardamos
      // na mesma para não voltar a pagar 2 minutos de scraping pelo mesmo NIF errado.
      table.boolean('found').notNullable().defaultTo(false)

      table.string('nome').nullable()
      table.string('tipo').nullable()
      table.string('estado').nullable()
      table.string('inadimplente').nullable()
      table.string('regime_iva').nullable()

      // Resposta completa do portal em JSON serializado (text, não coluna json nativa —
      // mesmo critério já usado em `security_logs.details`). O portal pode passar a
      // devolver campos novos sem que isto precise de migration.
      table.text('raw').nullable()

      table.timestamp('consultado_em').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
