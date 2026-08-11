import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produtos'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('numero').nullable()
    })

    // this.defer() é obrigatório aqui — this.schema.alterTable() só fica QUEUED (só
    // executa no fim de up(), via executeQueries()); uma query directa fora de defer()
    // corre de imediato, antes da coluna sequer existir ("Unknown column 'numero'").
    // Backfill: numeração sequencial por empresa, pela ordem cronológica de criação —
    // o registo mais antigo de cada empresa fica com o nº 1. Sem isto, tornar a coluna
    // notNullable a seguir falhava para qualquer linha já existente.
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE produtos p
        JOIN (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY created_at, id) AS rn
          FROM produtos
        ) t ON t.id = p.id
        SET p.numero = t.rn
      `)
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.integer('numero').notNullable().alter()
      table.unique(['empresa_id', 'numero'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['empresa_id', 'numero'])
      table.dropColumn('numero')
    })
  }
}
