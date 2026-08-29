import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produtos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.string('nome', 255).nullable()
      table.string('descricao', 255).nullable()
      table.boolean('is_service').nullable().defaultTo(false)
      table.uuid('fabricante_id').nullable()
      table.uuid('formato_id').nullable()
      table.uuid('empresa_id').nullable()
      table.uuid('marca_id').nullable()
      table.uuid('fornecedor_id').nullable()
      table.boolean('disponivel').nullable().defaultTo(true)
      table.integer('numero').notNullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'produtos_deleted_at_index')
      table.unique(['empresa_id', 'numero'], { indexName: 'produtos_empresa_id_numero_unique' })
      table.unique(['nome', 'empresa_id'], { indexName: 'produtos_nome_empresa_id_unique' })
      table
        .foreign(['empresa_id'], 'produtos_empresa_id_foreign')
        .references(['id'])
        .inTable('empresa')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['fabricante_id'], 'produtos_fabricante_id_foreign')
        .references(['id'])
        .inTable('produto_fabricantes')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['formato_id'], 'produtos_formato_id_foreign')
        .references(['id'])
        .inTable('produto_formatos')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['fornecedor_id'], 'produtos_fornecedor_id_foreign')
        .references(['id'])
        .inTable('produto_fornecedores')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
      table
        .foreign(['marca_id'], 'produtos_marca_id_foreign')
        .references(['id'])
        .inTable('marcas')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
