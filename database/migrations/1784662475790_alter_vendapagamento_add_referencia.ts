import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'vendapagamento'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * Referência do comprovativo do pagamento (nº de operação de uma transferência,
       * nº do recibo do TPA, etc.).
       *
       * Porquê: o PDV permitia escolher "Transferência bancária" e a venda era dada
       * como paga sem nada que a comprovasse — nem valor introduzido, nem referência.
       * Um pagamento por transferência sem referência é inconferível contra o extracto
       * bancário. Nullable porque a maioria dos pagamentos (numerário) não tem nem
       * precisa de referência.
       */
      table.string('referencia').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('referencia')
    })
  }
}
