import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface CategoriaProdutoQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart

  produto_categoria_id?: string
  produto_id?: string

  company_alias?: string
  empresa_id?: string
}
export interface Createcategorias_produtosDTO {
  produto_categoria_id: string
  produto_id: string
  empresa_id?: string
  company_alias?: string
}
export interface Updatecategorias_produtosDTO {
  produto_categoria_id?: string
  produto_id?: string
}
