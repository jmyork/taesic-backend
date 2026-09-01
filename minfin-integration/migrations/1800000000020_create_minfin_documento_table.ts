import { BaseSchema } from '@adonisjs/lucid/schema'

import { alinharColunaComReferencia, temTabela } from '../../database/helpers/esquema.js'

/**
 * Uma linha por documento dentro de uma submissão.
 *
 * ── Porque não basta a `minfin_submissao` ─────────────────────────────────────
 *
 * Porque o veredicto da AGT é POR DOCUMENTO, não por submissão. Um `resultCode`
 * de 1 significa "processamento concluído, com facturas válidas E facturas
 * inválidas" (1.2.3.1) — e a lista que diz quais é quais vem em
 * `documentStatusList`, um documento de cada vez, com os seus próprios erros.
 *
 * Guardar só o resultado da submissão responderia "algumas das trinta falharam"
 * a quem precisa de saber exactamente qual, para a reemitir.
 *
 * ── A ligação à factura interna ───────────────────────────────────────────────
 *
 * `factura_id` é opcional e é a ponte entre este módulo e o resto do sistema:
 * permite responder, a partir de uma factura do POS, "isto foi comunicado à AGT?
 * foi aceite?". Fica nulo quando a submissão não veio de uma factura interna
 * (uma reemissão manual, um lote importado), e é por isso que é anulável e não
 * a chave desta tabela.
 */
export default class extends BaseSchema {
  protected tableName = 'minfin_documento'

  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) {
        await db.schema.createTable(this.tableName, (table) => {
          table.uuid('id').notNullable()
          table.timestamp('created_at').notNullable().defaultTo(this.now())
          table.timestamp('updated_at').notNullable().defaultTo(this.now())
          table.timestamp('deleted_at').nullable()

          table.uuid('submissao_id').notNullable()

          /**
           * Repetido da submissão de propósito.
           *
           * Sem ele, "os documentos comunicados desta empresa" é sempre um join
           * — e este é o filtro de TODAS as leituras deste módulo, porque é o
           * isolamento por inquilino (checklist da secção 4 do CLAUDE.md). Uma
           * coluna repetida que nunca muda depois de escrita paga-se sozinha.
           */
          table.uuid('empresa_id').notNullable()

          /** A factura interna que deu origem a este documento, quando há uma. */
          table.uuid('factura_id').nullable()

          /** "minlength": 8, "maxlength": 60 (1.1.2.4). */
          table.string('document_no', 60).notNullable()

          /** FT, FR, NC, RC, ... — 2 caracteres. */
          table.string('document_type', 2).notNullable()

          /** O estado DECLARADO por nós: N, S, A ou R. */
          table.string('document_status', 1).notNullable()

          /** Preenchido quando `document_status` é 'A': I ou N. */
          table.string('document_cancel_reason', 1).nullable()

          table.date('document_date').notNullable()

          /**
           * O veredicto da AGT: 'V' (válida) ou 'I' (inválida). Nulo até
           * `obterEstado` responder.
           *
           * ⚠️ Coluna diferente de `document_status`, apesar de o Blueprint dar
           * o MESMO NOME aos dois campos (1.1.2.4 e 1.2.3.2) com conjuntos de
           * valores completamente diferentes. Juntá-los numa coluna só faria um
           * documento anulado ('A') e um documento inválido ('I') indistinguíveis
           * de um documento normal validado — e são três coisas distintas.
           */
          table.string('veredicto', 1).nullable()

          /**
           * O `hash` que aparece na resposta de `consultarFactura`. Não consta de
           * nenhuma tabela de composição do documento — só dos exemplos (#C-12) —
           * mas é o único identificador que a AGT devolve por documento, e é
           * plausível que venha a ser o que se imprime na factura.
           */
          table.string('hash', 255).nullable()

          /**
           * A assinatura enviada.
           *
           * `text` e não `varchar(256)`: o documento declara 256 caracteres, e um
           * JWS RS256 real tem 342 ou mais (DIVERGENCIAS.md #C-03). Dimensionar a
           * coluna pelo número declarado seria truncar a assinatura na escrita —
           * silenciosamente, se o modo estrito estiver desligado.
           */
          table.text('jws_document_signature').nullable()

          /** Os erros que a AGT devolveu para ESTE documento, em JSON. */
          table.text('erros_json').nullable()

          table.primary(['id'])

          /**
           * O mesmo documento não pode aparecer duas vezes na mesma submissão —
           * é a versão local do E09, e a única parte dele que se pode garantir
           * deste lado (o duplicado contra o repositório da AGT só eles vêem).
           */
          table.unique(['submissao_id', 'document_no'], {
            indexName: 'minfin_documento_submissao_documento_unique',
          })

          /**
           * "Este documento já foi comunicado? com que resultado?" — a pergunta
           * que se faz a partir do ecrã de uma factura. Não é única: um documento
           * recusado é reenviado noutra submissão, e o histórico das tentativas é
           * precisamente o que interessa guardar.
           */
          table.index(['empresa_id', 'document_no'], 'minfin_documento_empresa_documento_index')
          table.index(['factura_id'], 'minfin_documento_factura_index')
          table.index(['empresa_id', 'veredicto'], 'minfin_documento_veredicto_index')
          table.index(['deleted_at'], 'minfin_documento_deleted_at_index')
        })
      }

      // Ver a nota em 1800000000010 sobre charset/collation e ER_FK_INCOMPATIBLE_COLUMNS.
      await alinharColunaComReferencia(db, this.tableName, 'submissao_id', 'minfin_submissao', 'id')
      await alinharColunaComReferencia(db, this.tableName, 'empresa_id', 'empresa', 'id')
      await alinharColunaComReferencia(db, this.tableName, 'factura_id', 'factura', 'id')

      const chaves: Array<[string, string]> = [
        [
          'minfin_documento_submissao_id_foreign',
          `FOREIGN KEY (submissao_id) REFERENCES minfin_submissao (id) ON DELETE CASCADE ON UPDATE NO ACTION`,
        ],
        [
          'minfin_documento_empresa_id_foreign',
          `FOREIGN KEY (empresa_id) REFERENCES empresa (id) ON DELETE CASCADE ON UPDATE NO ACTION`,
        ],
        /*
         * `SET NULL` e não `CASCADE`: apagar a factura interna não pode apagar o
         * registo de que ela foi comunicada à AGT. A comunicação aconteceu, e o
         * que fica aqui é a prova disso — que é exactamente o que se vai
         * procurar numa inspecção.
         */
        [
          'minfin_documento_factura_id_foreign',
          `FOREIGN KEY (factura_id) REFERENCES factura (id) ON DELETE SET NULL ON UPDATE NO ACTION`,
        ],
      ]

      for (const [nome, definicao] of chaves) {
        try {
          await db.rawQuery(`ALTER TABLE ${this.tableName} ADD CONSTRAINT ${nome} ${definicao}`)
        } catch (erro: any) {
          if (![1005, 1022, 1061, 1826].includes(erro?.errno)) {
            console.warn(`[minfin] chave estrangeira ${nome} não criada: ${erro?.message}`)
          }
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
