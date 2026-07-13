import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface ProdutoFabricanteQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart

  nome?: string
  endereco?: string
  email?: string
  telefone?: string
  empresa_id?: string
  company_alias?: string
}
export interface Createproduto_fabricantesDTO {
  enabled?: boolean
  endereco: string
  telefone: string
  email: string
  nome: string
  empresa_id?: string
  company_alias?: string
}
export interface Updateproduto_fabricantesDTO {
  enabled?: boolean
  endereco?: string
  telefone?: string
  email?: string
  nome?: string
}
