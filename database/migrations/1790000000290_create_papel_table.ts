import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'papel'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
      table.timestamp('deleted_at').nullable()
      table.string('nome', 255).notNullable()
      table.string('descricao', 255).nullable()
      table.uuid('empresa_id').nullable()
      table.enum('escopo', ['plataforma', 'modelo', 'empresa']).notNullable().defaultTo('modelo')
      table.string('chave_escopo', 64).nullable()
      table.primary(['id'])
      table.index(['deleted_at'], 'papel_deleted_at_index')
      table.unique(['chave_escopo', 'nome'], { indexName: 'papel_escopo_nome_unique' })
      table
        .foreign(['empresa_id'], 'papel_empresa_id_foreign')
        .references(['id'])
        .inTable('empresa')
        .onDelete('CASCADE')
        .onUpdate('NO ACTION')
    })

    this.schema.raw(
      `ALTER TABLE \`papel\` ADD CONSTRAINT \`papel_escopo_empresa_chk\` CHECK (((\`escopo\` = _utf8mb4'empresa') and (\`empresa_id\` is not null)) or ((\`escopo\` <> _utf8mb4'empresa') and (\`empresa_id\` is null)))`
    )

    this.schema.raw(
      `CREATE TRIGGER \`papel_chave_escopo_bi\` BEFORE INSERT ON \`papel\` FOR EACH ROW SET NEW.chave_escopo = COALESCE(NEW.empresa_id, NEW.escopo)`
    )

    this.schema.raw(
      `CREATE TRIGGER \`papel_chave_escopo_bu\` BEFORE UPDATE ON \`papel\` FOR EACH ROW SET NEW.chave_escopo = COALESCE(NEW.empresa_id, NEW.escopo)`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
