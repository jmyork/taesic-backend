import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'taxa_iva'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()

      // Tabela de referência de plataforma (partilhada por todas as empresas, como
      // `plano`) — as taxas de IVA são definidas por lei, não por cada tenant.
      table.string('nome').notNullable()
      table.decimal('percentual', 22, 2).notNullable()
      table.boolean('ativo').notNullable().defaultTo(true)

      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable().index()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
