import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produtos'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Serviços não têm stock (quantidade_em_estoque do lote é sempre 0) — esta flag é
      // quem decide se um serviço pode ser vendido, já que "stock > 0" nunca se aplica a eles.
      table.boolean('disponivel').defaultTo(true)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
