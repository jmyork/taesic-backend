import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A chave estrangeira que fecha o ciclo `user` <-> `empresa`.
 *
 * Um utilizador pertence a uma empresa e uma empresa tem um utilizador dono: as
 * duas tabelas referem-se uma à outra, e nenhuma ordem de criação satisfaz as
 * duas restrições ao mesmo tempo. `user` nasce com a COLUNA `empresa_id` mas sem
 * a restrição, e é aqui — com as duas tabelas já criadas — que a restrição entra.
 *
 * (Era esta a razão de ser do antigo `1771767984622.1_alter_pos`, cujo `.1` no
 * nome existia só para o ficheiro caber entre dois já numerados.)
 */
export default class extends BaseSchema {
  protected tableName = 'user'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .foreign(['empresa_id'], 'user_empresa_id_foreign')
        .references(['id'])
        .inTable('empresa')
        .onDelete('SET NULL')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['empresa_id'], 'user_empresa_id_foreign')
    })
  }
}
