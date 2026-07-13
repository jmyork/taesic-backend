import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pos'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // `nome` era único a nível global, impedindo duas empresas distintas de teren
      // ambas, por exemplo, um ponto de venda chamado "Loja Principal".
      table.dropUnique(['nome'], 'pos_nome_unique')
      table.unique(['nome', 'empresa_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['nome', 'empresa_id'])
      table.unique(['nome'], 'pos_nome_unique')
    })
  }
}
