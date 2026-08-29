import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'caixa'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.uuid('user_id').nullable()
      table.dateTime('data_fecho').nullable()
      table.decimal('valor_inicial', 22, 2).nullable().defaultTo(0.00)
      table.decimal('total_vendas', 22, 2).nullable().defaultTo(0.00)
      table.enum('status', ['Aberto', 'Fechado']).nullable().defaultTo('Aberto')
      table.string('observacoes', 255).nullable()
      table.decimal('total_caixa', 22, 2).nullable()
      table.uuid('pos_id').nullable()
      table.uuid('empresa_id').nullable()
      table.integer('numero').nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'caixa_deleted_at_index')
      table.unique(['empresa_id', 'numero'], { indexName: 'caixa_empresa_id_numero_unique' })
      table
        .foreign(['empresa_id'], 'caixa_empresa_id_foreign')
        .references(['id'])
        .inTable('empresa')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['pos_id'], 'caixa_pos_id_foreign')
        .references(['id'])
        .inTable('pos')
        .onDelete('SET NULL')
        .onUpdate('NO ACTION')
      table
        .foreign(['user_id'], 'caixa_user_id_foreign')
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
