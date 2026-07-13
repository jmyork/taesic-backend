import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
import { MultipartFile } from '@adonisjs/core/bodyparser'

export interface ProdutoImagemQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: CreatedDtStart
  updatedDtEnd?: UpdatedDtEnd
  createdDtEnd?: CreatedDtEnd
  updatedDtStart?: UpdatedDtStart

  empresa_id?: string
  company_alias?: string
  produto_id?: string
}
export interface Createproduto_mediaDTO {
  enabled?: boolean
  media: MultipartFile[]
  produto_id: string
  company_alias?: string
  empresa_id?: string
}
export interface Updateproduto_mediaDTO {
  enabled?: boolean
  imagem_url?: string
  produto_id?: string
}
