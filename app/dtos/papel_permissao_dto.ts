import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface ProdutoFormatoQueryDTO {
  DeletedValue?: DeletedValue
  CreatedDtStart?: CreatedDtStart
  UpdatedDtEnd?: UpdatedDtEnd
  CreatedDtEnd?: CreatedDtEnd
  UpdatedDtStart?: UpdatedDtStart

  // campos pesquisaveis
  permissao_id?: string
  papel_id?: string
}

export interface Createpapel_permissaoDTO {
  enabled?: boolean
  permissao_id: string
  papel_id: string
}
export interface Updatepapel_permissaoDTO {
  enabled?: boolean
  permissao_id?: string
  papel_id?: string
}
