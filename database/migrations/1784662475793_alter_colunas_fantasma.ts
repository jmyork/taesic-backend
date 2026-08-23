import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cria as duas colunas que os models declaravam e a base de dados não tinha.
 *
 * Ambas vinham de uma linha comentada na migração original — o padrão que deixou
 * 38 dessas linhas espalhadas por `database/migrations/`. Enquanto ninguém as
 * escrevia eram inertes; estas duas eram escritas, e por isso não eram um detalhe
 * de arrumação mas dois erros 500 em produção:
 *
 *   cobranca.data_emissao  `data_emissao` é OBRIGATÓRIA em `cobranca_validator`,
 *                          portanto TODOS os pedidos a enviavam e TODOS rebentavam
 *                          com "Unknown column". `POST cobranca` estava
 *                          completamente inutilizável.
 *
 *   pessoa.ativo           aceite pelo validador na criação e na edição. Um pedido
 *                          que a incluísse rebentava da mesma forma. `cliente` — o
 *                          recurso irmão — tem esta coluna e usa-a nos filtros.
 *
 * As restantes 24 colunas fantasma eram todas `enabled`, e foram resolvidas do
 * outro lado: retiradas dos models em vez de criadas. `enabled` duplicaria
 * `deleted_at`, que é o que este projecto usa em todo o lado para activar e
 * desactivar registos (o `softDelete` da BaseRepository é um toggle). Criar 24
 * colunas que ninguém lê seria trocar um problema por outro maior.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('cobranca', (table) => {
      // Nullable: as cobranças que já existem não têm este dado, e inventá-lo
      // seria pior do que a sua ausência. É preenchido a seguir com `created_at`,
      // que é a melhor aproximação verdadeira que existe para elas.
      table.datetime('data_emissao').nullable()
    })

    this.defer(async (db) => {
      await db.rawQuery('UPDATE cobranca SET data_emissao = created_at WHERE data_emissao IS NULL')
    })

    this.schema.alterTable('pessoa', (table) => {
      table.boolean('ativo').notNullable().defaultTo(true)
    })
  }

  async down() {
    this.schema.alterTable('cobranca', (table) => {
      table.dropColumn('data_emissao')
    })
    this.schema.alterTable('pessoa', (table) => {
      table.dropColumn('ativo')
    })
  }
}
