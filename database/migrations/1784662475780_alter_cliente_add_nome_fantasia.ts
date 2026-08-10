import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cliente'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // O model (`nome_fantasia`) e o `updateclienteValidator`/`UpdateclienteDTO` já
      // suportavam este campo — nunca tinha sido acrescentado à BD, por isso qualquer
      // query que o tocasse (update ou, agora, a pesquisa por detalhes do cliente)
      // rebentava com "Unknown column".
      table.string('nome_fantasia').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('nome_fantasia')
    })
  }
}
