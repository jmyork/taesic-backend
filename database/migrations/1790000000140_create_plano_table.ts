import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plano'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.string('nome', 255).nullable()
      table.string('descricao', 255).nullable()
      table.decimal('preco', 22, 2).nullable()
      table.string('moeda', 255).nullable()
      table.string('periodo', 255).nullable()
      table.boolean('ativo').nullable()
      table.decimal('limite_uso', 22, 2).nullable()
      table.string('slug', 32).nullable()
      table.integer('limite_utilizadores').unsigned().nullable()
      table.integer('limite_postos').unsigned().nullable()
      table.integer('limite_produtos').unsigned().nullable()
      table.decimal('limite_faturacao_mensal', 22, 2).nullable()
      table.integer('dias_gratuitos').unsigned().notNullable().defaultTo(0)
      table.text('funcionalidades').nullable()
      table.integer('ordem').notNullable().defaultTo(0)
      table.primary(['id'])
      table.index(['deleted_at'], 'plano_deleted_at_index')
      table.unique(['slug'], { indexName: 'plano_slug_unique' })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
