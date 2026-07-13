import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface EmpresaQueryDTO {
  DeletedValue?: DeletedValue
  CreatedDtStart?: CreatedDtStart
  UpdatedDtEnd?: UpdatedDtEnd
  CreatedDtEnd?: CreatedDtEnd
  UpdatedDtStart?: UpdatedDtStart

  // campos pesquisaveis
  nome?: string
  nif?: string
  user_id?: string
  tipo?: string

  company_alias?: string
  localizacao?: string
  contacto?: string

  regime_iva?: boolean
  status?: boolean
  inadiplente?: boolean
  verified?: boolean
}

export interface CreateEmpresaDTO {
  nome: string
  nif: string
  user_id: string
  tipo: string

  company_alias: string
  localizacao: string
  contacto: string

  regime_iva?: boolean
  status?: boolean
  inadiplente?: boolean
  verified?: boolean
}
export interface UpdateempresaDTO {
  enabled?: boolean
  nome?: string
  nif?: string
  user_id?: string
  regime_iva: boolean
  localizacao: string
  contacto: string
  company_alias: string
}

export interface ResendCompanyActivationEmailDTO{
  nif_ou_company_alias:string
}
