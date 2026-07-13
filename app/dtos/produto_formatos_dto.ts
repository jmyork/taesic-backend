import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface ProdutoFormatoQueryDTO {
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

export interface Createproduto_formatosDTO {
  enabled?: boolean
  descricao?: string
  nome: string
  empresa_id?: string
  company_alias?: string
}
export interface Updateproduto_formatosDTO {
  enabled?: boolean
  descricao?: string
  nome?: string
}
