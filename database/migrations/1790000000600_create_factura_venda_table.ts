import { BaseSchema } from '@adonisjs/lucid/schema'

import { alinharColunaComReferencia, temRestricao, temTabela } from '../helpers/esquema.js'

/**
 * As vendas cobertas por um documento que cobre VÁRIAS.
 *
 * ── Porque é que `factura.venda_id` não chega ────────────────────────────────
 *
 * A factura global titula todas as operações de um cliente num período (art.º 8.º,
 * periodicidade máxima mensal). São várias vendas, e nenhuma delas é «a» venda —
 * é por isso que `factura.venda_id` é anulável nesse tipo. Mas sem sítio onde
 * guardar as outras, o documento saía com uma linha única a dizer «Factura
 * Global» onde deviam estar os artigos das compras do período.
 *
 * ── Congelado à emissão, e é esse o ponto ────────────────────────────────────
 *
 * A alternativa era derivar as vendas por cliente e período no momento de LER —
 * sem tabela nenhuma. **Não serve para um documento fiscal.** Uma venda lançada
 * depois, ou corrigida, mudaria os artigos de uma factura JÁ EMITIDA e já
 * entregue ao cliente. O que este documento cobre fica decidido no instante em
 * que ele é emitido, e não volta a mudar.
 *
 * ── Não substitui `factura.venda_id` ─────────────────────────────────────────
 *
 * Uma factura normal continua a ter a sua venda na coluna: é uma relação de um
 * para um, é por ela que `relatorios_repository` e o mapeamento para a AGT já
 * procuram, e movê-la para aqui obrigaria a reescrever tudo isso para não ganhar
 * nada. Esta tabela é só para o caso plural.
 */
export default class extends BaseSchema {
  protected tableName = 'factura_venda'

  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) {
        await db.schema.createTable(this.tableName, (table) => {
          table.uuid('id').notNullable()
          table.uuid('factura_id').notNullable()
          table.uuid('venda_id').notNullable()

          table.timestamp('created_at').notNullable().defaultTo(this.now())
          table.timestamp('updated_at').notNullable().defaultTo(this.now())

          table.primary(['id'])

          /**
           * A mesma venda não entra duas vezes no mesmo documento — seria
           * facturá-la a dobrar dentro da própria factura.
           */
          table.unique(['factura_id', 'venda_id'], { indexName: 'factura_venda_unique' })

          /**
           * Por `venda_id` porque a pergunta mais frequente é a inversa: «esta
           * venda já está coberta por alguma factura global?». É o que
           * `vendasPorFacturar` faz por cada listagem.
           */
          table.index(['venda_id'], 'factura_venda_venda_id_index')
        })
      }

      /*
       * As chaves por último — é o que pode falhar (regra 7.20.1), e o alinhamento
       * de charset/collation antes de cada uma (7.20.2): um `DEFAULT CHARSET` sem
       * `COLLATE` já parou um deploy neste projecto.
       */
      await alinharColunaComReferencia(db, this.tableName, 'factura_id', 'factura', 'id')
      await alinharColunaComReferencia(db, this.tableName, 'venda_id', 'vendas', 'id')

      const chaves: [string, string, string, string][] = [
        // Apagar a factura leva as suas ligações — não são um facto próprio, são
        // a composição do documento.
        ['factura_venda_factura_id_foreign', 'factura_id', 'factura', 'CASCADE'],
        // Uma venda coberta por um documento fiscal não se apaga por baixo dele.
        ['factura_venda_venda_id_foreign', 'venda_id', 'vendas', 'RESTRICT'],
      ]

      for (const [nome, coluna, tabela, aoApagar] of chaves) {
        if (await temRestricao(db, this.tableName, nome)) continue

        try {
          await db.rawQuery(
            `ALTER TABLE ${this.tableName}
               ADD CONSTRAINT ${nome} FOREIGN KEY (${coluna}) REFERENCES ${tabela} (id)
               ON DELETE ${aoApagar} ON UPDATE NO ACTION`
          )
        } catch (erro) {
          console.warn(`[factura_venda] chave ${nome} não criada: ${(erro as Error).message}`)
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
