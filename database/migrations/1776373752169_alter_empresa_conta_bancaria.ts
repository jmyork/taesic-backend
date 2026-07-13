import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'empresa_conta_bancaria'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('empresa_id')
      table.string('conta')
      table.string('iban')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
