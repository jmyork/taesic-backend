import { DeletedValue } from '../helpers/Types.js'
import type { CondicaoPagamento } from '../helpers/regras_de_emissao.js'

export interface VendasQueryDTO {
  deleted?: DeletedValue

  // Audit dates
  createdDtStart?: Date
  createdDtEnd?: Date
  updatedDtStart?: Date
  updatedDtEnd?: Date

  // Filtros exatos
  numero?: number
  venda_tipo?: 'presencial' | 'online' | 'online_loja'
  status?: 'aberta' | 'fechada' | 'cancelada' | 'reembolsada' | 'proforma'
  fechado?: boolean
  caixa_id?: string
  user_id?: string
  // string[] só é usado internamente (vendas_controller.ts) para restringir um
  // Vendedor/Estoquista aos seus próprios postos — nunca vem assim de um query param HTTP.
  pos_id?: string | string[]
  cliente_online_id?: string
  cliente_presencial_id?: string
  condicao_pagamento?: CondicaoPagamento
  // data_venda?: Date
  total?: number

  // Ranges
  data_venda_start?: Date
  data_venda_end?: Date
  total_start?: number
  total_end?: number

  // Empresa
  empresa_id?: string
  company_alias?: string

  // Paginação
  page?: number
  limit?: number
}

export interface VendaCloseDTO {
  id: string
  user_id?: string
  empresa_id?: string
  company_alias?: string
  cupom_codigo?: string

  /**
   * Como é que esta venda é paga. Decide o documento fiscal emitido no fecho, se
   * o pagamento é exigido e se o stock sai — ver `REGRAS_DA_CONDICAO`.
   *
   * Omitida usa a que ficou gravada na venda; sem nenhuma, `pronto_pagamento` —
   * quem não diz nada está a vender ao balcão, que é o que este sistema sempre fez.
   */
  condicao_pagamento?: CondicaoPagamento

  /**
   * O prazo, em dias, só nas vendas a crédito. Omitido usa o da empresa
   * (`empresa.prazo_pagamento_dias`); acima do tecto legal é recusado no validator.
   */
  prazo_pagamento_dias?: number
}

/** Entregar o produto de uma venda por adiantamento — ver `vendas_repository.entregar()`. */
export interface VendaEntregarDTO {
  id: string
  user_id?: string
  company_alias?: string
}

/**
 * Ajustar uma venda fechada PARA CIMA — emite uma nota de débito.
 *
 * Não altera `vendas.total`: a venda é o registo do que foi vendido naquele dia, e
 * reescrevê-lo faria o documento já emitido deixar de bater certo com ela. O
 * acréscimo vive na nota, que é o documento que a lei tem para isto.
 */
export interface VendaAjustarDTO {
  id: string
  company_alias?: string
  user_id?: string
  valor: number
  motivo: string
}
export interface VendaShowDTO {
  id: string
  user_id?: string
  empresa_id?: string
  company_alias?: string
}

export interface CreateVendasDTO {
  empresa_id?: string
  company_alias?: string
  user_id?: string
  venda_tipo: 'presencial' | 'online' | 'online_loja'
  cliente_presencial_id?: string
  cliente_online_id?: string
  caixa_id?: string
  data_venda?: Date
  total?: number
  fechado?: boolean
  proforma?: boolean

  /**
   * Escolhida logo na abertura da venda, para o ecrã poder mostrar desde o início
   * o documento que vai sair. Pode ser mudada no fecho — é lá que conta.
   */
  condicao_pagamento?: CondicaoPagamento
}

export interface UpdateVendasDTO {
  total?: number
  fechado?: boolean
  caixa_id?: string
  data_venda?: Date
  cliente_presencial_id?: string
  cliente_online_id?: string
  empresa_id?: string
  company_alias?: string
  user_id?: string
}