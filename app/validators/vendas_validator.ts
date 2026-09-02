import vine from '@vinejs/vine'

import { CONDICOES_DE_PAGAMENTO } from '../helpers/regras_de_emissao.js'
import { PRAZO_PAGAMENTO_MAXIMO_DIAS } from '../helpers/prazo_de_pagamento.js'

export const VendasQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),

    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),

    numero: vine.number().positive().withoutDecimals().optional(),
    venda_tipo: vine.enum(['presencial', 'online', 'online_loja']).optional(),
    status: vine.enum(['aberta', 'fechada', 'cancelada', 'reembolsada', 'proforma']).optional(),
    fechado: vine.boolean().optional(),
    caixa_id: vine.string().uuid().trim().escape().optional(),
    user_id: vine.string().uuid().trim().escape().optional(),
    pos_id: vine.string().uuid().trim().escape().optional(),
    cliente_online_id: vine.string().uuid().trim().escape().optional(),
    cliente_presencial_id: vine.string().uuid().trim().escape().optional(),

    data_venda: vine.date({ formats: ['iso8601'] }).optional(),
    data_venda_start: vine.date({ formats: ['iso8601'] }).optional(),
    data_venda_end: vine.date({ formats: ['iso8601'] }).afterField('data_venda_start').optional(),

    total: vine.number().min(0).optional(),
    total_start: vine.number().min(0).optional(),
    total_end: vine.number().min(0).optional(),

    empresa_id: vine.string().uuid().trim().escape().optional(),
    company_alias: vine.string().trim().escape().optional(),

    page: vine.number().positive().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional()
  })
)

export const CreateVendaValidator = vine.compile(
  vine.object({
    venda_tipo: vine.enum(['presencial', 'online', 'online_loja']).optional(),
    cliente_presencial_id: vine.string().uuid().escape().optional(),
    cliente_online_id: vine.string().uuid().escape().optional(),
    caixa_id: vine.string().uuid().escape().optional(),
    data_venda: vine.date({ formats: ['iso8601'] }).beforeOrEqual('today').optional(),
    total: vine.number().min(0).optional(),
    fechado: vine.boolean().optional(),
    // Cria a venda já com status 'proforma' em vez de 'aberta' — uma cotação com
    // histórico real, mas que nunca passa por close() (sem pagamento/stock).
    proforma: vine.boolean().optional(),

    /**
     * Escolhida logo na abertura para o ecrã poder mostrar, desde o primeiro
     * artigo, que documento vai sair. É no fecho que ela conta — e lá pode ser
     * outra, porque a condição combina-se com o cliente no fim, não no princípio.
     */
    condicao_pagamento: vine.enum(CONDICOES_DE_PAGAMENTO).optional(),
  })
)

export const CloseVendaValidator = vine.compile(
  vine.object({
    id: vine.string().uuid().exists(async (db, value, field) => {
      const venda = await db.from('vendas')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('vendas.id', value)
        .where('empresa.company_alias', field.data.company_alias ?? '')
        .first()
      return !!venda
    }),
    // Código de cupão opcional para aplicar um desconto ao fechar a venda — a existência e
    // validade (empresa, expiração) são verificadas no repositório, não aqui, porque dependem
    // do total já calculado da venda.
    cupom_codigo: vine.string().trim().optional(),

    /**
     * Como é que esta venda é paga — e, daí, que documento fiscal sai dela.
     *
     * Omitida usa a que ficou gravada na abertura, e sem nenhuma vale
     * `pronto_pagamento`: é o que este sistema sempre fez, e é o que descreve com
     * exactidão todas as vendas anteriores a esta mudança.
     */
    condicao_pagamento: vine.enum(CONDICOES_DE_PAGAMENTO).optional(),

    /**
     * O prazo de pagamento, em dias — só faz sentido a crédito.
     *
     * O tecto é imposto AQUI e não na base de dados (regra 7.20): recusar com 400 e
     * uma mensagem que diz qual é o máximo é o que permite a quem está ao balcão
     * corrigir na hora. Uma restrição na coluna devolveria um erro do motor como
     * 500, sem dizer sequer que campo estava errado.
     *
     * Omitido usa o da empresa (`empresa.prazo_pagamento_dias`).
     */
    prazo_pagamento_dias: vine
      .number()
      .withoutDecimals()
      .min(1)
      .max(PRAZO_PAGAMENTO_MAXIMO_DIAS)
      .optional(),
  })
)

/**
 * Ajustar uma venda fechada para cima — emite uma nota de débito.
 *
 * O motivo é OBRIGATÓRIO e não é burocracia: é o que vai nas observações do
 * documento, e uma nota de débito que não diz porque é que o cliente passou a dever
 * mais é uma nota que ninguém consegue explicar quando ele telefonar a perguntar.
 */
export const AjustarVendaValidator = vine.compile(
  vine.object({
    valor: vine.number().decimal([0, 2]).positive(),
    motivo: vine.string().trim().minLength(3).maxLength(500),
  })
)

export const ShowVendaValidator = vine.compile(
  vine.object({
    id: vine.string().uuid().exists(async (db, value, field) => {
      const venda = await db.from('vendas')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('vendas.id', value)
        .where('empresa.company_alias', field.data.company_alias ?? '')
        .first()

      return !!venda
    }),
  }))


export const UpdateVendaValidator = vine.compile(
  vine.object({
    total: vine.number().min(0).optional(),
    fechado: vine.boolean().optional(),
    caixa_id: vine.string().uuid().escape().optional(),
    data_venda: vine.date({ formats: ['iso8601'] }).optional(),
    cliente_presencial_id: vine.string().uuid().escape().optional(),
    cliente_online_id: vine.string().uuid().escape().optional()
  })
)