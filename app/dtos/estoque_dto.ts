import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface EstoqueQueryDTO {
  deleted?: DeletedValue

  // Audit dates
  createdDtStart?: CreatedDtStart
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart
  updatedDtEnd?: UpdatedDtEnd

  // Filtros exatos
  pos_id?: string
  registrado_por?: string
  // data_registro?: Date
  motivo?: MotivoMovimentacao | string
  tipo_movimentacao?: TipoMovimentacao
  quantidade?: number
  lote_produto_id?: string
  produto_id?: string

  // Ranges
  data_registro_start?: Date
  data_registro_end?: Date
  quantidade_start?: number
  quantidade_end?: number

  // Empresa
  empresa_id?: string
  company_alias?: string

  // Paginação
  page?: number
  limit?: number
}

export interface CreateestoqueDTO {
  enabled?: boolean
  pos_id?: string
  registrado_por?: string
  data_registro?: Date
  motivo?: MotivoMovimentacao | string
  tipo_movimentacao?: TipoMovimentacao
  quantidade?: number
  lote_produto_id: string

  empresa_id?: string
  company_alias?: string
}
export interface UpdateestoqueDTO {
  enabled?: boolean
  pos_id?: string
  registrado_por?: string
  // data_registro?: Date
  motivo_retirada?: string
  tipo_movimentacao?: TipoMovimentacao
  quantidade?: string
  lote_produto_id?: string
}

export type TipoMovimentacao =
  | 'entrada' // Entrada genérica
  | 'saida' // Saída genérica
  | 'ajuste_positivo' // Aumenta estoque (correção)
  | 'ajuste_negativo' // Diminui estoque (correção)
  | 'transferencia_entrada' // Recebimento
  | 'transferencia_saida' // Envio

export type MotivoMovimentacao =
  // Motivos para entrada
  | 'compra'
  | 'devolucao_cliente'
  | 'producao'

  // Motivos para saída
  | 'venda'
  | 'devolucao_fornecedor'
  | 'perda'
  | 'vencimento'
  | 'consumo_interno'
  | 'amostra_gratis'

  // Motivos para ajuste
  | 'inventario'
  | 'correcao_erro'
  | 'dano'

  // Motivos para transferência
  | 'reposicao'
  | 'balanceamento'
