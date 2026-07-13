import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'promotor'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()

      table.string('nome').notNullable()
      table.string('email').notNullable().unique()
      table.string('telefone').nullable()

      // NULL = promotor da plataforma (pode gerar leads/cupões em qualquer empresa cliente).
      // Preenchido = promotor de uma empresa (domain) específica — os seus cupões só valem lá.
      table.uuid('empresa_id').nullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')

      // Slug curto e único usado no link público de perfil (/p/:codigo_perfil).
      table.string('codigo_perfil').notNullable().unique()

      table.boolean('ativo').notNullable().defaultTo(true)

      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable().index()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
