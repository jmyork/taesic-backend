import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plataforma_cupom_uso'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.uuid('cupom_id').notNullable()
      table.uuid('subscricao_id').notNullable()
      table.uuid('empresa_id').notNullable()
      table.decimal('valor_base', 12, 2).notNullable().defaultTo(0.00)
      table.decimal('valor_desconto', 12, 2).notNullable().defaultTo(0.00)
      table.decimal('valor_comissao', 12, 2).notNullable().defaultTo(0.00)
      table.string('moeda', 8).notNullable().defaultTo('AOA')
      table.uuid('registado_por').nullable()
      table.dateTime('created_at').notNullable()
      table.dateTime('updated_at').notNullable()
      table.dateTime('deleted_at').nullable()
      table.primary(['id'])
      table.index(['cupom_id'], 'plataforma_cupom_uso_cupom_id_index')
      table.unique(['subscricao_id'], { indexName: 'plataforma_cupom_uso_subscricao_unique' })
      table
        .foreign(['cupom_id'], 'plataforma_cupom_uso_cupom_id_foreign')
        .references(['id'])
        .inTable('plataforma_cupom')
        .onDelete('NO ACTION')
        .onUpdate('NO ACTION')
      table
        .foreign(['empresa_id'], 'plataforma_cupom_uso_empresa_id_foreign')
        .references(['id'])
        .inTable('empresa')
        .onDelete('NO ACTION')
        .onUpdate('NO ACTION')
      table
        .foreign(['registado_por'], 'plataforma_cupom_uso_registado_por_foreign')
        .references(['id'])
        .inTable('user')
        .onDelete('NO ACTION')
        .onUpdate('NO ACTION')
      table
        .foreign(['subscricao_id'], 'plataforma_cupom_uso_subscricao_id_foreign')
        .references(['id'])
        .inTable('subscricao')
        .onDelete('NO ACTION')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
