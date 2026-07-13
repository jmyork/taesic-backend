import { DeletedValue } from '../helpers/Types.js'
export interface VendaItensQueryDTO {
  deleted?: DeletedValue
  // Audit dates
  createdDtStart?: Date
  createdDtEnd?: Date
  updatedDtStart?: Date
  updatedDtEnd?: Date

  preco_unitario?: number
  quantidade?: number
  lote_produto_id?: string
  venda_id?: string

  empresa_id?: string | null
  company_alias?: string | null
  quantidade_reembolsada?: number | null
}

export interface Createvenda_itensDTO {
  enabled?: boolean
  preco_unitario?: number
  quantidade: number
  lote_produto_id: string
  venda_id: string
  quantidade_reembolsada: number

  operation_type?: 'sub' | 'add'
  empresa_id?: string | null
  company_alias?: string | null
}
export interface Updatevenda_itensDTO {
  enabled?: boolean
  preco_unitario?: number
  quantidade?: number
  lote_produto_id?: string
  venda_id?: string
  operation_type?: 'sub' | 'add'
  quantidade_reembolsada?: number
}
