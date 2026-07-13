import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plano'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('nome')
      table.string('descricao').nullable()
      table.decimal('preco')
      table.string('moeda')
      table.string('periodo')
      table.boolean('ativo')
      table.decimal('limite_uso').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
