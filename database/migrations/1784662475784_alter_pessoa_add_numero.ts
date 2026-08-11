import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pessoa'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Nullable — pessoa_repository.create() permite criar sem company_alias (sem
      // empresa associada); sem empresa não há "sequência por empresa" que faça sentido.
      table.integer('numero').nullable()
    })

    // this.defer() é obrigatório — ver comentário equivalente em
    // alter_produtos_add_numero.ts.
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE pessoa p
        JOIN (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY created_at, id) AS rn
          FROM pessoa
          WHERE empresa_id IS NOT NULL
        ) t ON t.id = p.id
        SET p.numero = t.rn
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
