import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cupom'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('user_id').nullable()
      table.decimal('desconto', 22, 2).nullable()
      table.dateTime('validade').nullable()
      table.uuid('empresa_id').nullable()
      table.string('codigo', 255).notNullable()
      table.uuid('promotor_id').notNullable()
      table.integer('numero').notNullable()
      table.primary(['id'])
      table.unique(['codigo'], { indexName: 'cupom_codigo_unique' })
      table.index(['deleted_at'], 'cupom_deleted_at_index')
      table.unique(['empresa_id', 'numero'], { indexName: 'cupom_empresa_id_numero_unique' })
      table
        .foreign(['empresa_id'], 'cupom_empresa_id_foreign')
        .references(['id'])
        .inTable('empresa')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['promotor_id'], 'cupom_promotor_id_foreign')
        .references(['id'])
        .inTable('promotor')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['user_id'], 'cupom_user_id_foreign')
        .references(['id'])
        .inTable('user')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
