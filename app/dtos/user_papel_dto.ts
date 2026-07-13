import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface UserPapelQueryDTO {
  DeletedValue?: DeletedValue
  CreatedDtStart?: CreatedDtStart
  UpdatedDtEnd?: UpdatedDtEnd
  CreatedDtEnd?: CreatedDtEnd
  UpdatedDtStart?: UpdatedDtStart

  // campos pesquisaveis
  papel_id?: string
  user_id?: string
}

export interface Createuser_papelDTO {
  enabled?: boolean
  papel_id: string
  user_id: string
}
export interface Updateuser_papelDTO {
  enabled?: boolean
  papel_id?: string
  user_id?: string
}
