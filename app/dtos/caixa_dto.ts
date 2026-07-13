import { DateTime } from 'luxon'
import { DeletedValue } from '../helpers/Types.js'
import { CreatedDtEnd, CreatedDtStart, UpdatedDtEnd, UpdatedDtStart } from './aux_dto.js'

export interface CreatecaixaDTO {
  total_caixa: number
  observacoes?: string
  status: string
  total_vendas?: number
  valor_inicial?: number
  data_fecho?: DateTime
  user_id: string
}

export interface CaixaQueryDTO {
  // Datas genéricas
  createdDtStart?: CreatedDtStart
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  deleted?: DeletedValue

  // Campos pesquisáveis
  observacoes?: string
  status?: string
  total_vendas?: number
  valor_inicial?: number
  data_fecho?: Date
  user_id?: string
  total_caixa?: number

  total_vendas_start?: number
  total_vendas_end?: number
  valor_inicial_start?: number
  valor_inicial_end?: number

  total_caixa_start?: number
  total_caixa_end?: number

  empresa_id?: string
  company_alias?: string
  pos_id?: string

  page?: number
  limit?: number
}
export interface OpenCaixaDTO {
  valor_inicial?: number
  observacoes?: string
  pos_id: string
  user_id: string
  company_alias: string
}

export interface ReOpenCaixaDTO {
  company_alias: string
  user_id: string
}
export interface CloseCaixaDTO {
  observacoes?: string
  company_alias?: string
  user_id?: string
}
