import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface ProdutoFornecedorQueryDTO {
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
export interface Createproduto_fornecedoresDTO {
  endereco: string
  telefone: string
  email: string
  nome: string
  empresa_id?: string
  company_alias?: string
}
export interface Updateproduto_fornecedoresDTO {
  endereco?: string
  telefone?: string
  email?: string
  nome?: string
}
