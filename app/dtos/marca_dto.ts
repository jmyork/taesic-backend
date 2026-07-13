import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface MarcaQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart

  nome?: string
  descricao?: string
  empresa_id: string
  company_alias?: string
}

export interface CreatemarcaDTO {
  descricao?: string
  nome: string
  empresa_id?: string
  company_alias?: string
}
export interface UpdatemarcaDTO {
  descricao?: string
  nome?: string
  // empresa_id?: string
  // company_alias?: string
}
