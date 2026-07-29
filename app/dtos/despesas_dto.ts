import { DeletedValue } from '../helpers/Types.js'
import { CreatedDtEnd, CreatedDtStart, UpdatedDtEnd, UpdatedDtStart } from './aux_dto.js'

export interface CreatedespesasDTO {
  pos_id?: string | null
  categoria: string
  descricao?: string
  valor: number
  data_despesa: Date
  registrado_por?: string
  empresa_id?: string
  company_alias?: string
}

export interface UpdatedespesasDTO {
  pos_id?: string | null
  categoria?: string
  descricao?: string
  valor?: number
  data_despesa?: Date
}

export interface DespesasQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart
  updatedDtEnd?: UpdatedDtEnd

  pos_id?: string
  categoria?: string
  valor?: number
  valor_start?: number
  valor_end?: number
  data_despesa_start?: Date
  data_despesa_end?: Date

  empresa_id?: string | null
  company_alias?: string | null

  page?: number
  limit?: number
}
