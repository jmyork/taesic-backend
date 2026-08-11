import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cupom'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('numero').nullable()
    })

    // this.defer() é obrigatório — ver comentário equivalente em
    // alter_produtos_add_numero.ts.
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE cupom c
        JOIN (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY created_at, id) AS rn
          FROM cupom
        ) t ON t.id = c.id
        SET c.numero = t.rn
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
