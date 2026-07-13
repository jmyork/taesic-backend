import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produto_media'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('produto_id')
      table.foreign('produto_id').references('id').inTable('produtos').onDelete('CASCADE')
      table.string('media')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => { })
  }
}
