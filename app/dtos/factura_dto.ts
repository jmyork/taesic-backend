import type { FacturaTipo } from '../helpers/tipos_de_documento.js'
import type { MotivoAnulacao } from '#models/faturacao/factura'

export interface EmitirFacturaDTO {
  company_alias: string
  tipo: FacturaTipo

  /** Obrigatório só nos tipos com `exigeVenda` — ver `tipos_de_documento.ts`. */
  venda_id?: string

  /** Obrigatório nos tipos com `exigeOrigem` (nota de crédito, recibo, aviso). */
  documento_origem_id?: string

  /** As vendas cobertas — obrigatório só na factura global. */
  vendas_ids?: string[]

  /** Obrigatórios só na factura global. */
  periodo_inicio?: Date
  periodo_fim?: Date

  /** Sem isto, a série por omissão do tipo e do ano (`FT2026`). */
  serie?: string

  data_operacao?: Date
  local_operacao?: string
  cliente_morada?: string

  /** Exigido nos tipos que não nascem de uma venda; ignorado nos outros. */
  total?: number

  observacoes?: string
}

export interface FacturaQueryDTO {
  company_alias: string
  page?: number
  limit?: number
  venda_id?: string
  tipo?: FacturaTipo
  serie?: string
  ano?: number
  status?: 'emitida' | 'anulada'
  vendedor?: string
  vendedor_id?: string
  data_inicio?: Date
  data_fim?: Date
  q?: string
  deleted?: 'deleted' | 'all' | null
}

export interface AnularFacturaDTO {
  id: string
  company_alias: string
  /** `I` ou `N` — obrigatório, imposto no validator. */
  motivo_anulacao: MotivoAnulacao
}

export interface ShowFacturaDTO {
  id: string
  company_alias: string
}
