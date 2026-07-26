import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'metodopagamento'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('empresa_id').nullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')

      // 'nome' era único a nível global — passa a único por empresa (duas empresas podem
      // ambas ter, por exemplo, um método chamado "Numerário").
      table.dropUnique(['nome'])
      table.unique(['empresa_id', 'nome'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
