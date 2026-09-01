import vine from '@vinejs/vine'

import {
  TIPOS_DE_DOCUMENTO_VALIDOS,
  TIPOS_QUE_EXIGEM_ORIGEM,
  TIPOS_QUE_EXIGEM_PERIODO,
  TIPOS_QUE_EXIGEM_VENDA,
  TIPOS_QUE_EXIGEM_VENDAS,
} from '../helpers/tipos_de_documento.js'

/**
 * Emitir um documento fiscal.
 *
 * ── O que é obrigatório depende do que o documento É ──────────────────────────
 *
 * Uma factura precisa da venda que a originou; uma nota de crédito precisa do
 * documento que rectifica; uma factura global precisa do período que cobre; um
 * recibo não precisa de nenhuma das três. Não há um conjunto de campos
 * obrigatórios — há um por tipo.
 *
 * Por isso os campos são todos opcionais na forma e condicionais na regra, com
 * `requiredWhen('tipo', 'in', ...)`. As listas vêm de
 * `app/helpers/tipos_de_documento.ts` e não estão escritas aqui: um tipo novo na
 * tabela passa a ser validado sem se tocar neste ficheiro, e um tipo esquecido
 * aqui não existe.
 *
 * É aqui que a obrigatoriedade se impõe, e não na base de dados (regra 7.20). O
 * `NOT NULL` devolveria `ER_BAD_NULL_ERROR` — um 500 que não diz que campo falta.
 */
export const EmitirFacturaValidator = vine.compile(
  vine.object({
    tipo: vine.enum(TIPOS_DE_DOCUMENTO_VALIDOS),

    venda_id: vine
      .string()
      .trim()
      .uuid()
      .optional()
      .requiredWhen('tipo', 'in', TIPOS_QUE_EXIGEM_VENDA),

    /**
     * O documento que este rectifica ou liquida.
     *
     * Sem ele a AGT recusa a nota de crédito com E13 — e o mesmo se aplica, pela
     * mesma razão de fundo, aos recibos e avisos de cobrança: um documento que
     * liquida outro não se entende sozinho.
     */
    documento_origem_id: vine
      .string()
      .trim()
      .uuid()
      .optional()
      .requiredWhen('tipo', 'in', TIPOS_QUE_EXIGEM_ORIGEM),

    /**
     * As vendas cobertas — só a factura global.
     *
     * Plural, e não `venda_id`: uma factura global titula TODAS as operações de um
     * período, e nenhuma delas é «a» venda do documento. Ficam congeladas em
     * `factura_venda` no momento da emissão.
     */
    vendas_ids: vine
      .array(vine.string().trim().uuid())
      .minLength(1)
      .distinct()
      .optional()
      .requiredWhen('tipo', 'in', TIPOS_QUE_EXIGEM_VENDAS),

    /**
     * Só a factura global. O art.º 8.º limita o período a um mês — a verificação
     * de que `fim >= inicio` e de que não excede um mês vive no repositório, com
     * as duas datas já convertidas, porque é uma relação entre campos e não uma
     * regra de formato.
     */
    periodo_inicio: vine
      .date({ formats: ['YYYY-MM-DD'] })
      .optional()
      .requiredWhen('tipo', 'in', TIPOS_QUE_EXIGEM_PERIODO),

    periodo_fim: vine
      .date({ formats: ['YYYY-MM-DD'] })
      .optional()
      .requiredWhen('tipo', 'in', TIPOS_QUE_EXIGEM_PERIODO),

    /**
     * A série de numeração. Opcional: sem ela o repositório usa a série por
     * omissão do tipo e do ano (`FT2026`, `NC2026`).
     *
     * Alfanumérica e no mínimo 3 caracteres, como o Blueprint exige de um
     * `seriesCode` — uma série que não passe aqui é recusada pela AGT com E33 do
     * outro lado da rede, e este é o lado onde o erro ainda é corrigível.
     */
    serie: vine
      .string()
      .trim()
      .minLength(3)
      .maxLength(60)
      .regex(/^[A-Za-z0-9]+$/)
      .optional(),

    /**
     * Data, hora e local da operação (art.º 10.º). Opcionais porque numa venda de
     * balcão coincidem com a emissão e o repositório preenche-os a partir dela; a
     * hipótese de os indicar existe para o caso que o art.º 8.º prevê — emitir até
     * ao quinto dia útil seguinte ao da operação.
     */
    data_operacao: vine.date({ formats: ['YYYY-MM-DD HH:mm:ss', 'iso8601'] }).optional(),
    local_operacao: vine.string().trim().maxLength(255).optional(),

    /** Sede ou domicílio do adquirente (art.º 10.º), quando conhecido. */
    cliente_morada: vine.string().trim().maxLength(255).optional(),

    /**
     * O valor do documento, para os tipos que não vêm de uma venda.
     *
     * Nos que vêm, é ignorado: o total é o da venda, e aceitar aqui um número que
     * a contradiga permitiria emitir uma factura por um valor diferente do que foi
     * cobrado.
     */
    total: vine.number().decimal([0, 2]).optional(),

    observacoes: vine.string().trim().optional(),
  })
)

/**
 * Anular um documento fiscal.
 *
 * O motivo é OBRIGATÓRIO, e só há dois: `I` — incorrecta identificação do
 * adquirente; `N` — o documento não foi enviado ao adquirente. São os que os
 * n.ºs 8 e 9 do art.º 8.º admitem, e os mesmos que a AGT aceita em
 * `documentCancelReason`.
 *
 * Sem ele, o documento anulado ficava impossível de comunicar: o mapeamento para
 * a AGT recusa-se a montar o envelope sem motivo, e a anulação é o único momento
 * em que alguém sabe qual foi. A obrigatoriedade vive aqui e não na coluna, que é
 * anulável (regra 7.20) porque só se preenche ao anular.
 */
export const AnularFacturaValidator = vine.compile(
  vine.object({
    motivo_anulacao: vine.enum(['I', 'N'] as const),
  })
)

export const FacturaQueryValidator = vine.compile(
  vine.object({
    page: vine.number().optional(),
    limit: vine.number().optional(),
    venda_id: vine.string().trim().uuid().optional(),

    /** Filtros por tipo, série e ano — é assim que se lê um livro de uma série. */
    tipo: vine.enum(TIPOS_DE_DOCUMENTO_VALIDOS).optional(),
    serie: vine.string().trim().maxLength(60).optional(),
    ano: vine.number().min(2000).max(2999).optional(),

    /** Emitido ou anulado — a pergunta mais frequente sobre um livro de documentos. */
    status: vine.enum(['emitida', 'anulada'] as const).optional(),

    /** Intervalo de EMISSÃO, inclusivo nos dois extremos. */
    data_inicio: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    data_fim: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),

    /**
     * Quem fez a venda que o documento titula.
     *
     * `vendedor` é o NOME, parcial — é como se procura uma pessoa. `vendedor_id`
     * fica para quem tenha o id na mão (um relatório, um link).
     */
    vendedor: vine.string().trim().maxLength(120).optional(),
    vendedor_id: vine.string().trim().uuid().optional(),

    /** Pesquisa livre por nome ou NIF do adquirente, pela referência e pelo vendedor. */
    q: vine.string().trim().maxLength(120).optional(),

    deleted: vine.enum(['deleted', 'all']).optional(),
  })
)
