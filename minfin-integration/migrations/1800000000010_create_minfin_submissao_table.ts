import { BaseSchema } from '@adonisjs/lucid/schema'

import { alinharColunaComReferencia, temTabela } from '../../database/helpers/esquema.js'

/**
 * Uma linha por chamada a `registarFactura`.
 *
 * ── Porque é que isto tem de existir ──────────────────────────────────────────
 *
 * Porque `registarFactura` é ASSÍNCRONO. A chamada devolve um `requestID` e mais
 * nada: se as facturas são válidas, só se sabe mais tarde, chamando `obterEstado`
 * com esse identificador. Entre uma coisa e outra pode passar-se um turno inteiro
 * de caixa.
 *
 * Sem esta tabela, o `requestID` vive na memória do processo que fez a chamada e
 * morre com ele — e o que se perde não é um número: é a única forma de descobrir
 * se as facturas que já foram entregues ao cliente foram aceites pela AGT. Ficava
 * um lote de documentos fiscais em estado desconhecido, sem forma de o
 * reconstruir a não ser voltar a submeter tudo (e apanhar E09, "já consta no
 * repositório", para as que tinham passado).
 *
 * ── O que é a chave de idempotência ───────────────────────────────────────────
 *
 * `submission_ref` — o `submissionGUID`/`submissionId` que foi enviado. O
 * Blueprint diz que "este identificador deverá ser único por contribuinte
 * emissor" (1.1.2), e é essa a regra que o índice único aqui aplica. Guardá-lo é
 * o que permite responder à pergunta que se faz depois de um timeout: "isto
 * chegou a ser submetido?".
 */
export default class extends BaseSchema {
  protected tableName = 'minfin_submissao'

  /** Re-executável, como manda a regra 7.19 do CLAUDE.md. */
  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) {
        await db.schema.createTable(this.tableName, (table) => {
          table.uuid('id').notNullable()
          table.timestamp('created_at').notNullable().defaultTo(this.now())
          table.timestamp('updated_at').notNullable().defaultTo(this.now())
          table.timestamp('deleted_at').nullable()

          table.uuid('empresa_id').notNullable()

          /**
           * O NIF tal como FOI ENVIADO, e não uma leitura de `empresa.nif` feita
           * mais tarde.
           *
           * A assinatura da chamada cobre o `taxRegistrationNumber`, e uma
           * empresa que corrija o NIF na sua ficha depois de submeter passaria a
           * ter um registo que não corresponde ao que a AGT recebeu — tornando
           * impossível reconstruir a assinatura para conferir a submissão.
           */
          table.string('nif', 15).notNullable()

          /** `submissionGUID` ou `submissionId`, conforme a nomenclatura em uso. */
          table.string('submission_ref', 64).notNullable()

          /**
           * O que a AGT devolveu. "maxlength": 15 no documento; nulo enquanto a
           * chamada não tiver sido aceite, e é justamente esse nulo que
           * distingue "por submeter/recusado" de "submetido, à espera".
           */
          table.string('request_id', 15).nullable()

          /**
           * Onde a submissão está, do nosso ponto de vista:
           *
           *   pendente      — montada, ainda não saiu (ou saiu e não sabemos)
           *   recusada      — a AGT respondeu 4xx: o conteúdo tem de ser corrigido
           *   indisponivel  — não houve resposta: repetir a MESMA submissão
           *   aceite        — temos requestID, a validação diferida está a correr
           *   concluida     — obterEstado deu um resultCode final (0, 1 ou 2)
           *   cancelada     — obterEstado deu 9
           *
           * `varchar` e não `enum`: um estado novo num `enum` é um `ALTER TABLE`
           * que reescreve a tabela, e esta é a tabela que cresce com o volume de
           * facturação. O conjunto de valores é imposto pelo model.
           */
          table.string('estado', 20).notNullable().defaultTo('pendente')

          /** O `resultCode` de `obterEstado` (0,1,2,7,8,9). Nulo até haver um. */
          table.tinyint('result_code').nullable()

          table.integer('numero_documentos').notNullable().defaultTo(0)

          /**
           * Quantas vezes já se perguntou o estado.
           *
           * A AGT devolve E97 ("solicitação prematura") e E98 ("demasiadas
           * solicitações repetidas") a quem pergunta cedo ou vezes de mais — e o
           * documento não diz qual é o intervalo aceitável. Contar as tentativas
           * é o que permite espaçá-las (recuo exponencial) em vez de descobrir o
           * limite a bater nele.
           */
          table.integer('tentativas_estado').notNullable().defaultTo(0)

          table.timestamp('proxima_consulta_em').nullable()
          table.timestamp('ultima_consulta_em').nullable()

          /**
           * O pedido e a resposta, tal como foram.
           *
           * `longtext`: 30 documentos com linhas e impostos passam largamente os
           * 64 KB de um `text`, e um payload truncado é pior do que nenhum —
           * parece completo e não é.
           *
           * Guardar isto é opcional (`MINFIN_REGISTAR_PAYLOADS`). ⚠️ O pedido
           * contém as assinaturas e os dados fiscais dos clientes; quem ligar
           * isto num ambiente com dados reais fica com uma tabela sujeita às
           * mesmas regras de retenção que `activity_logs`.
           */
          table.text('pedido_json', 'longtext').nullable()
          table.text('resposta_json', 'longtext').nullable()

          /** Erros normalizados da última tentativa, em JSON. */
          table.text('erros_json').nullable()

          /**
           * Avisos que não impedem a submissão — hoje, essencialmente o do
           * comprimento das assinaturas (DIVERGENCIAS.md #C-03). Ficam gravados
           * porque, no dia em que a AGT recusar com E08, é esta coluna que diz
           * há quanto tempo o problema estava à vista.
           */
          table.text('avisos_json').nullable()

          table.primary(['id'])

          /**
           * "Este identificador deverá ser único por contribuinte emissor"
           * (1.1.2). Chave de idempotência: impede que uma repetição depois de um
           * timeout crie uma segunda submissão para a mesma tentativa.
           */
          table.unique(['empresa_id', 'submission_ref'], {
            indexName: 'minfin_submissao_empresa_ref_unique',
          })

          table.index(['request_id'], 'minfin_submissao_request_id_index')

          /**
           * O índice da rotina que pergunta o estado: "que submissões estão à
           * espera e já passou a hora de voltar a perguntar?". Sem ele, essa
           * pergunta — feita de minuto a minuto — varria a tabela inteira.
           */
          table.index(['estado', 'proxima_consulta_em'], 'minfin_submissao_pendentes_index')
          table.index(['deleted_at'], 'minfin_submissao_deleted_at_index')
        })
      }

      /**
       * Alinhar tipo/charset/collation ANTES da chave estrangeira.
       *
       * Ver `database/helpers/esquema.ts` e a secção 7.20.2 do CLAUDE.md: uma
       * chave entre colunas de texto exige os três iguais dos dois lados, e uma
       * base criada com collation explícita diferente da omissão do charset faz
       * o motor recusar com ER_FK_INCOMPATIBLE_COLUMNS. Foi assim que uma
       * migração que passava em desenvolvimento parou o deploy de `api-qua`.
       */
      await alinharColunaComReferencia(db, this.tableName, 'empresa_id', 'empresa', 'id')

      /*
       * A chave estrangeira é criada à parte, e a falha é tolerada.
       *
       * Ordem deliberada (regra 7.20.1): o que pode falhar vem DEPOIS do que
       * torna a tabela utilizável. A tabela e os índices já lá estão; uma base
       * onde a chave não possa ser criada fica com integridade referencial
       * garantida pela aplicação em vez do motor — o que é pior, mas é muito
       * melhor do que bloquear esta migração e todas as seguintes.
       */
      try {
        await db.rawQuery(
          `ALTER TABLE ${this.tableName}
             ADD CONSTRAINT minfin_submissao_empresa_id_foreign
             FOREIGN KEY (empresa_id) REFERENCES empresa (id)
             ON DELETE CASCADE ON UPDATE NO ACTION`
        )
      } catch (erro: any) {
        // ER_FK_DUP_NAME / ER_DUP_KEYNAME: já existe, de uma execução anterior.
        if (![1005, 1022, 1061, 1826].includes(erro?.errno)) {
          console.warn(
            `[minfin] chave estrangeira minfin_submissao_empresa_id_foreign não criada: ${erro?.message}`
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
