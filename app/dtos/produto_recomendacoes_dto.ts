import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface ProdutoRecomendacaoQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart

  recomendacao?: string
  produto_id?: string
  company_alias?: string
  empresa_id?: string
}

export interface Createproduto_recomendacoesDTO {
  enabled?: boolean
  recomendacao: string
  produto_id: string

  company_alias?: string
  empresa_id?: string
}
export interface Updateproduto_recomendacoesDTO {
  enabled?: boolean
  recomendacao?: string
  produto_id?: string
}
