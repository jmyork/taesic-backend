import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'vendas'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // vendas nunca teve empresa_id próprio — vendas_repository.ts sempre resolveu a
      // empresa via `vendas.caixa_id → caixa.pos_id → pos.empresa_id` (3 hops). Agora
      // que `caixa.empresa_id` existe (ver alter_caixa_add_empresa_id_numero), o
      // backfill abaixo usa-o directamente (1 hop) — mais simples e consistente com o
      // que caixa_repository.ts já trata como autoritativo (user.empresa_id).
      table.uuid('empresa_id').nullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')
      table.integer('numero').nullable()
    })

    // this.defer() é obrigatório — ver comentário equivalente em
    // alter_produtos_add_numero.ts. Requer que a migration de caixa (empresa_id) já
    // tenha corrido — a ordem dos timestamps garante isso (787 < 788).
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE vendas v
        JOIN caixa c ON c.id = v.caixa_id
        SET v.empresa_id = c.empresa_id
        WHERE c.empresa_id IS NOT NULL
      `)

      await db.rawQuery(`
        UPDATE vendas v
        JOIN (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY created_at, id) AS rn
          FROM vendas
          WHERE empresa_id IS NOT NULL
        ) t ON t.id = v.id
        SET v.numero = t.rn
      `)
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['empresa_id', 'numero'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['empresa_id', 'numero'])
      table.dropForeign(['empresa_id'])
      table.dropColumn('empresa_id')
      table.dropColumn('numero')
    })
  }
}
