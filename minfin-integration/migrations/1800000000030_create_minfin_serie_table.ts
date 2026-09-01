import { BaseSchema } from '@adonisjs/lucid/schema'

import { alinharColunaComReferencia, temTabela } from '../../database/helpers/esquema.js'

/**
 * As séries de numeração registadas na AGT.
 *
 * ── Porque é que isto se guarda, se `listarSeries` as devolve ─────────────────
 *
 * Porque uma factura não se emite sem série, e a série tem de ter sido aceite
 * pela AGT ANTES do primeiro documento (E34: "série da factura é inexistente
 * para o contribuinte"). Depender de uma chamada de rede para saber se se pode
 * emitir significa que, com o serviço da AGT em baixo, ninguém factura — e o
 * negócio pára por uma razão que não é o negócio.
 *
 * Com esta tabela, `listarSeries` passa a ser uma RECONCILIAÇÃO periódica em vez
 * de uma dependência do caminho crítico.
 *
 * ── O que esta tabela deliberadamente NÃO faz ─────────────────────────────────
 *
 * Não numera facturas. A numeração sequencial deste sistema já existe e vive em
 * `app/helpers/sequencial_numero.ts`, com o bloqueio da linha da empresa a
 * serializar as emissões concorrentes. Um segundo contador aqui daria dois
 * números diferentes para o mesmo documento, e o que sai na factura tem de ser
 * um só.
 */
export default class extends BaseSchema {
  protected tableName = 'minfin_serie'

  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) {
        await db.schema.createTable(this.tableName, (table) => {
          table.uuid('id').notNullable()
          table.timestamp('created_at').notNullable().defaultTo(this.now())
          table.timestamp('updated_at').notNullable().defaultTo(this.now())
          table.timestamp('deleted_at').nullable()

          table.uuid('empresa_id').notNullable()

          /** "minlength": 3, "maxlength": 60, alfanumérico e contendo o ano. */
          table.string('series_code', 60).notNullable()
          table.integer('series_year').notNullable()

          /** FT, FR, NC, ... Uma série serve um tipo de documento só (E37). */
          table.string('document_type', 2).notNullable()

          table.integer('first_document_number').notNullable().defaultTo(1)

          /**
           * A (`aberta`), U (`em utilização`) ou F (`fechada`) — o estado do lado
           * da AGT, actualizado por `listarSeries`. Nulo enquanto eles não o
           * disserem: inventar um 'A' aqui faria uma série que a AGT nunca
           * aceitou parecer pronta a usar.
           */
          table.string('series_status', 1).nullable()

          /** FEPC, FESF ou SF (1.6.3.2). */
          table.string('invoicing_method', 4).nullable()

          /**
           * Quando é que a AGT aceitou (`resultCode: 1` em `solicitarSerie`).
           *
           * É esta coluna, e não a existência da linha, que autoriza a emitir na
           * série. Um pedido recusado deixa cá a linha com a data a nulo — o que
           * permite tentar de novo sem perder o que se pediu, e impede que uma
           * série por aceitar seja usada por engano.
           */
          table.timestamp('registada_em').nullable()

          /** Último documento criado na série, segundo a AGT. Só informativo. */
          table.string('last_document_created', 60).nullable()

          /** Erros da última tentativa de registo, em JSON. */
          table.text('erros_json').nullable()

          table.primary(['id'])

          /**
           * E31: "código de série de numeração já se encontra em utilização para
           * o contribuinte". A unicidade é por empresa e não global — duas
           * empresas podem ambas ter uma série "FT12025", tal como já acontece
           * com `metodopagamento.nome` (secção 7.6 do CLAUDE.md).
           *
           * `deleted_at` NÃO entra no índice, pela mesma razão de
           * `papel_escopo_nome_unique` (7.13): no MySQL os NULL contam como
           * distintos num índice único, portanto incluí-lo deixaria passar duas
           * linhas activas com o mesmo código. Uma série apagada é REVIVIDA ao
           * ser recriada com o mesmo código.
           */
          table.unique(['empresa_id', 'series_code'], {
            indexName: 'minfin_serie_empresa_codigo_unique',
          })

          /** "Que série uso para emitir uma FT de 2025?" — a pergunta da emissão. */
          table.index(
            ['empresa_id', 'document_type', 'series_year'],
            'minfin_serie_empresa_tipo_ano_index'
          )
          table.index(['deleted_at'], 'minfin_serie_deleted_at_index')
        })
      }

      await alinharColunaComReferencia(db, this.tableName, 'empresa_id', 'empresa', 'id')

      try {
        await db.rawQuery(
          `ALTER TABLE ${this.tableName}
             ADD CONSTRAINT minfin_serie_empresa_id_foreign
             FOREIGN KEY (empresa_id) REFERENCES empresa (id)
             ON DELETE CASCADE ON UPDATE NO ACTION`
        )
      } catch (erro: any) {
        if (![1005, 1022, 1061, 1826].includes(erro?.errno)) {
          console.warn(
            `[minfin] chave estrangeira minfin_serie_empresa_id_foreign não criada: ${erro?.message}`
          )
        }
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (await temTabela(db, this.tableName)) {
        await db.schema.dropTable(this.tableName)
      }
    })
  }
}
