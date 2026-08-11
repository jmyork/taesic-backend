import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'caixa'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // caixa nunca teve empresa_id próprio — caixa_repository.ts já resolve a
      // empresa via `caixa.user_id → user.empresa_id` em paginate()/findOrFail()/
      // open()/destroy(), mas paginate() também tenta `.where('caixa.empresa_id', ...)`
      // quando só `filter.empresa_id` é passado sem `company_alias` — coluna que nunca
      // existiu, rebentaria com "Unknown column" se esse ramo fosse alcançado. Adicionar
      // a coluna corrige esse bug latente, além de permitir a numeração sequencial aqui.
      table.uuid('empresa_id').nullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')
      table.integer('numero').nullable()
    })

    // this.defer() é obrigatório — ver comentário equivalente em
    // alter_produtos_add_numero.ts. empresa_id vem de user.empresa_id (a mesma cadeia
    // já usada como autoritativa neste repositório) — só depois de o preencher é que a
    // numeração por empresa faz sentido. Utilizadores sem empresa (ex.: Platform_Admin)
    // deixam caixa.empresa_id/numero como null.
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE caixa c
        JOIN user u ON u.id = c.user_id
        SET c.empresa_id = u.empresa_id
        WHERE u.empresa_id IS NOT NULL
      `)

      await db.rawQuery(`
        UPDATE caixa c
        JOIN (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY created_at, id) AS rn
          FROM caixa
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
      table.dropForeign(['empresa_id'])
      table.dropColumn('empresa_id')
      table.dropColumn('numero')
    })
  }
}
