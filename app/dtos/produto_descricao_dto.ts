import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface ProdutoDescricaoQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart
  propriedade?: string
  descricao_detalhada?: string
  produto_id?: string
  empresa_id?: string
  company_alias: string
}

export interface Createproduto_descricaoDTO {
  enabled?: boolean
  propriedade: string
  descricao_detalhada: string
  produto_id: string
  empresa_id?: string
  company_alias?: string
}
export interface Updateproduto_descricaoDTO {
  enabled?: boolean
  propriedade?: string
  descricao_detalhada?: string
  produto_id?: string
}
