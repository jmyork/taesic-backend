import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'userpos'

  async up() {
    // `user_id` e `pos_id` tinham cada um a sua própria constraint `unique()`,
    // impedindo um utilizador de ficar associado a mais do que um pos (e um pos de
    // ficar associado a mais do que um utilizador) — apesar de `userpos` ser uma
    // tabela de junção pensada para N:N. Mesmo problema (e mesma correcção) já feito
    // para `pos.nome` em `1779500000001_alter_pos_nome_unique_per_empresa.ts`:
    // substituída por uma unique composta, que só impede duplicar a mesma associação.
    //
    // Em dois passos porque o MySQL/InnoDB recusa apagar um índice que ainda seja a
    // única cobertura de uma foreign key — cria-se primeiro a unique composta (cobre
    // `user_id`, por ser a coluna à esquerda) e um índice simples para `pos_id`, só
    // depois se apagam os dois índices `unique()` antigos.
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['user_id', 'pos_id'])
      table.index(['pos_id'], 'userpos_pos_id_index')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['user_id'], 'userpos_user_id_unique')
      table.dropUnique(['pos_id'], 'userpos_pos_id_unique')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['user_id'], 'userpos_user_id_unique')
      table.unique(['pos_id'], 'userpos_pos_id_unique')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['user_id', 'pos_id'])
      table.dropIndex(['pos_id'], 'userpos_pos_id_index')
    })
  }
}
