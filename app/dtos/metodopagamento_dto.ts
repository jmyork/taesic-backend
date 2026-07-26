import { DeletedValue } from "../helpers/Types.js"
import { CreatedDtEnd, CreatedDtStart, UpdatedDtEnd, UpdatedDtStart } from "./aux_dto.js"

export interface CreatemetodopagamentoDTO {
  descricao: string
  nome: string
  empresa_id?: string
  company_alias?: string
}
export interface UpdatemetodopagamentoDTO {
  descricao?: string
  nome?: string
}

export interface MetodoPagamentoQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart

  nome?: string
  descricao?: string

  empresa_id?: string | null
  company_alias?: string | null

  page?: number
  limit?: number
}
