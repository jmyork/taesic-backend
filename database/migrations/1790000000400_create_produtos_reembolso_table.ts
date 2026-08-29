import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produtos_reembolso'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('venda_item_id').nullable()
      table.uuid('user_id').nullable()
      table.integer('quantidade').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'produtos_reembolso_deleted_at_index')
      table
        .foreign(['user_id'], 'produtos_reembolso_user_id_foreign')
        .references(['id'])
        .inTable('user')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['venda_item_id'], 'produtos_reembolso_venda_item_id_foreign')
        .references(['id'])
        .inTable('venda_itens')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
