import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface LoteQueryDTO {
  deleted?: DeletedValue

  // Datas genéricas
  createdDtStart?: CreatedDtStart
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart
  updatedDtEnd?: UpdatedDtEnd

  // Campos pesquisáveis
  preco_compra?: number
  preco_venda?: number
  quantidade_em_estoque?: number
  produto_id?: string
  lote?: string

  // Data de fabrico
  data_fabrico?: Date
  data_fabrico_start?: Date
  data_fabrico_end?: Date

  // Data de validade
  data_validade?: Date
  data_validade_start?: Date
  data_validade_end?: Date

  preco_compra_start?: number
  preco_venda_end?: number
  preco_compra_end?: number
  preco_venda_start?: number

  empresa_id?: string
  company_alias?: string
}

export interface CreateloteDTO {
  enabled?: boolean
  preco_compra?: number
  preco_venda: number
  quantidade_em_estoque?: number
  data_fabrico?: Date
  data_validade?: Date
  produto_id: string
  lote?: string
  user_id: string

  empresa_id?: string
  company_alias?: string
}
export interface UpdateloteDTO {
  enabled?: boolean
  preco_compra?: number
  preco_venda?: number
  quantidade_em_estoque?: number
  data_fabrico?: Date
  data_validade?: Date
  produto_id?: string
  lote?: string
}
