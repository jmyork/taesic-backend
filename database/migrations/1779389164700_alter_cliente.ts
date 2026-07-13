import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cliente'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.enum('tipo', ['Pessoa Física', 'Pessoa Jurídica']).nullable()
      table.string('nome').nullable()
      table.string('razao_social').nullable()
      table.string('email').nullable()
      table.string('telefone').nullable()
      table.string('telefone_secundario').nullable()
      table.string('nif').nullable()
      table.string('numero_registro').nullable()
      table.date('data_nascimento').nullable()
      table.enum('genero', ['Masculino', 'Feminino']).nullable()
      table.enum('estado_civil', ['Solteiro', 'Casado', 'Divorciado', 'Viúvo']).nullable()
      table.string('profissao').nullable()
      table.string('website').nullable()
      table.string('endereco').nullable()
      table.string('bairro').nullable()
      table.string('cidade').nullable()
      table.string('provincia').nullable()
      table.string('pais').nullable()
      table.string('codigo_postal').nullable()
      table.boolean('ativo').nullable()
      table.decimal('limite_credito', 10, 2).nullable()
      table.decimal('saldo', 10, 2).nullable()
      table.string('observacao').nullable()
      table.string('logo').nullable()
      table.string('foto').nullable()
      table.uuid('cliente_pai_id').nullable()
      table.foreign('cliente_pai_id').references('id').inTable('cliente').onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (__) => {})
  }
}
