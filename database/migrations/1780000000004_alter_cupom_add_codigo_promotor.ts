import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cupom'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // O código partilhável/redimível do cupão — o `user_id` pré-existente nunca chegou a ser
      // usado por nenhuma funcionalidade em produção; cupões pertencem a um promotor, não a um
      // user com login (os promotores autenticam-se por OTP, não têm conta `user`).
      table.string('codigo').notNullable().unique()
      table.uuid('promotor_id').notNullable()
      table.foreign('promotor_id').references('id').inTable('promotor').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['promotor_id'])
      table.dropColumn('promotor_id')
      table.dropColumn('codigo')
    })
  }
}
