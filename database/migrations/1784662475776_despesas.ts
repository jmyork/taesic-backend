import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'despesas'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()

      table.uuid('empresa_id').notNullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')

      // Opcional — despesa pode ser da empresa como um todo (ex.: renda do escritório) ou
      // específica de um posto de venda (ex.: eletricidade de uma loja).
      table.uuid('pos_id').nullable()
      table.foreign('pos_id').references('id').inTable('pos').onDelete('SET NULL')

      table.string('categoria').notNullable()
      table.string('descricao').nullable()
      table.decimal('valor', 22, 2).notNullable()
      table.date('data_despesa').notNullable()

      table.uuid('registrado_por').notNullable()
      table.foreign('registrado_por').references('id').inTable('user').onDelete('CASCADE')

      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable().index()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
