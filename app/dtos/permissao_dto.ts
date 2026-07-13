import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface PermissaoQueryDTO {
  DeletedValue?: DeletedValue
  CreatedDtStart?: CreatedDtStart
  UpdatedDtEnd?: UpdatedDtEnd
  CreatedDtEnd?: CreatedDtEnd
  UpdatedDtStart?: UpdatedDtStart

  // campos pesquisaveis
  nome?: boolean
  descricao?: string
}

export interface CreatepermissaoDTO {
  enabled?: boolean
  descricao: string
  nome: string
}
export interface UpdatepermissaoDTO {
  enabled?: boolean
  descricao?: string
  nome?: string
}
