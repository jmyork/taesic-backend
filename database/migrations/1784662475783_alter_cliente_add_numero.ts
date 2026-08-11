import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cliente'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Fica nullable (ao contrário de produtos/factura) — `cliente.empresa_id` já é
      // nullable (clientes de plataforma, sem tenant, ver cliente_repository.create());
      // sem empresa não há "sequência por empresa" que faça sentido.
      table.integer('numero').nullable()
    })

    // this.defer() é obrigatório — ver comentário equivalente em
    // alter_produtos_add_numero.ts. Backfill só das linhas com empresa_id — pela ordem
    // cronológica de criação, o registo mais antigo de cada empresa fica com o nº 1.
    // Linhas sem empresa_id ficam sem numero (permanece null).
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE cliente c
        JOIN (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY created_at, id) AS rn
          FROM cliente
          WHERE empresa_id IS NOT NULL
        ) t ON t.id = c.id
        SET c.numero = t.rn
      `)
    })

    this.schema.alterTable(this.tableName, (table) => {
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
