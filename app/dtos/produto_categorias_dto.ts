import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface ProdutoCategoriaQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart
  nome?: string
  descricao?: string
  empresa_id?: string
  company_alias?: string
}
export interface Createproduto_categoriasDTO {
  descricao: string
  nome: string
  empresa_id?: string
  company_alias?: string
}
export interface Updateproduto_categoriasDTO {
  descricao?: string
  nome?: string
}
