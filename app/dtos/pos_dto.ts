import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface PosQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart

  // campos pesquisaveis
  empresa_id?: string
  company_alias?: string
  email?: string
  contacto?: string
  localizacao?: string
  nome?: string
}

export interface CreateposDTO {
  enabled?: boolean
  email: string
  contacto: string
  localizacao: string
  nome: string
  empresa_id?: string
  company_alias?: string
}
export interface UpdateposDTO {
  enabled?: boolean
  empresa_id?: string
  email?: string
  contacto?: string
  localizacao?: string
  nome?: string
}
