import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lead'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()

      table.uuid('promotor_id').notNullable()
      table.foreign('promotor_id').references('id').inTable('promotor').onDelete('CASCADE')

      // A que empresa este lead pertence — o promotor de plataforma vê o catálogo de todas as
      // empresas na sua página pública, por isso o lead regista em qual delas o clique ocorreu.
      table.uuid('empresa_id').nullable()
      table.foreign('empresa_id').references('id').inTable('empresa').onDelete('CASCADE')

      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
