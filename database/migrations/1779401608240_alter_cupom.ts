import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cupom'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('user_id');
      table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE');
      table.decimal('desconto');
      table.datetime('validade').nullable();
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {
    })
  }
}