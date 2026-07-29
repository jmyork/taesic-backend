import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'empresa'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Só relevante quando `regime_iva` é true — decide a taxa aplicada no cálculo de
      // "IVA liquidado" nos relatórios. Nullable: uma empresa pode estar sujeita ao
      // regime de IVA sem ainda ter uma taxa atribuída (fica sem IVA liquidado calculado
      // até ser definida, em vez de assumir uma taxa por omissão arbitrária).
      table.uuid('taxa_iva_id').nullable()
      table.foreign('taxa_iva_id').references('id').inTable('taxa_iva').onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
