import { DeletedValue } from '../helpers/Types.js'

export interface VendasQueryDTO {
  deleted?: DeletedValue

  // Audit dates
  createdDtStart?: Date
  createdDtEnd?: Date
  updatedDtStart?: Date
  updatedDtEnd?: Date

  // Filtros exatos
  venda_tipo?: 'presencial' | 'online' | 'online_loja'
  status?: 'aberta' | 'fechada' | 'cancelada' | 'reembolsada'
  fechado?: boolean
  caixa_id?: string
  user_id?: string
  cliente_online_id?: string
  cliente_presencial_id?: string
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
  enabled?: boolean
}

export interface UpdateVendasDTO {
  total?: number
  fechado?: boolean
  caixa_id?: string
  data_venda?: Date
  cliente_presencial_id?: string
  cliente_online_id?: string
  enabled?: boolean
  empresa_id?: string
  company_alias?: string
  user_id?: string
}