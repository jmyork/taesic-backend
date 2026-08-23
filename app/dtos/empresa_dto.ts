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
  nome?: string
  nif?: string
  user_id?: string
  regime_iva: boolean
  localizacao: string
  contacto: string
  company_alias: string
  taxa_iva_id?: string
}

/**
 * Suspensão pelo dono da plataforma.
 *
 * `actor_id` é anulável porque nem toda a suspensão vem de um clique: um comando
 * ace ou uma rotina de cobrança não têm utilizador para apontar. O motivo, esse,
 * é sempre obrigatório — ver a migração `alter_empresa_suspensao`.
 */
export interface SuspenderEmpresaDTO {
  empresa_id: string
  motivo: string
  actor_id?: string | null
}

export interface ReactivarEmpresaDTO {
  empresa_id: string
  actor_id?: string | null
}

export interface ResendCompanyActivationEmailDTO{
  nif_ou_company_alias:string
}
