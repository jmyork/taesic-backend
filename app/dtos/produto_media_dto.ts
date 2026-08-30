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
  media: MultipartFile | MultipartFile[]
  produto_id: string
  company_alias?: string
  empresa_id?: string
}
export interface Updateproduto_mediaDTO {
  // `imagem_url` saiu daqui com o campo do validador: não é coluna de
  // `produto_media` e nada a lia. Ver a nota em produto_media_validator.ts.
  produto_id?: string
}
