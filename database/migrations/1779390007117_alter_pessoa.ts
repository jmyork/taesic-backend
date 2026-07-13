import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pessoa'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('nome')
      table.string("sobrenome")
      table.string('email').nullable()
      table.string('telefone').nullable()
      table.string('nif').nullable()
      table.string("img_url").nullable()
      table.date('data_nascimento').nullable()
      table.string('genero').nullable()
      table.string('endereco').nullable()
      table.string('cidade').nullable()
      table.string('pais').nullable()
      
      table.enum('tipo', ['Cliente', 'Funcionario', "Promotor"]).defaultTo("Funcionario").nullable()

      table.uuid('empresa_id').nullable()
      table.foreign("empresa_id").references("id").inTable("empresa").onDelete("SET NULL")

      table.uuid('user_id').nullable()
      table.foreign('user_id').references('id').inTable('user').onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => { })
  }
}
