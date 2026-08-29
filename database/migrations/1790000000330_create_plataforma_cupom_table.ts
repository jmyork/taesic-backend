import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plataforma_cupom'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.string('codigo', 32).notNullable()
      table.uuid('promotor_id').notNullable()
      table.string('descricao', 255).nullable()
      table.decimal('desconto_percentagem', 5, 2).notNullable().defaultTo(0.00)
      table.decimal('comissao_percentagem', 5, 2).notNullable().defaultTo(0.00)
      table.dateTime('validade').nullable()
      table.integer('limite_utilizacoes').unsigned().nullable()
      table.boolean('activo').notNullable().defaultTo(true)
      table.dateTime('created_at').notNullable()
      table.dateTime('updated_at').notNullable()
      table.dateTime('deleted_at').nullable()
      table.primary(['id'])
      table.unique(['codigo'], { indexName: 'plataforma_cupom_codigo_unique' })
      table
        .foreign(['promotor_id'], 'plataforma_cupom_promotor_id_foreign')
        .references(['id'])
        .inTable('promotor')
        .onDelete('NO ACTION')
        .onUpdate('NO ACTION')
    })

    this.schema.raw(
      `ALTER TABLE \`plataforma_cupom\` ADD CONSTRAINT \`plataforma_cupom_percentagens_chk\` CHECK ((\`desconto_percentagem\` >= 0) and (\`desconto_percentagem\` <= 100) and (\`comissao_percentagem\` >= 0) and (\`comissao_percentagem\` <= 100))`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
