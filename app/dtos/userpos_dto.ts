import { DeletedValue } from '../helpers/Types.js'
export interface CreateuserposDTO {
  pos_id: string
  user_id: string
  empresa_id?: string
  company_alias?: string
}
export interface UpdateuserposDTO {
  pos_id?: string
  user_id?: string
}

export interface UserPosQueryDTO {
  deleted?: DeletedValue
  createdDtStart?: Date
  updatedDtEnd?: Date
  createdDtEnd?: Date
  updatedDtStart?: Date

  user_id?: string
  pos_id?: string

  company_alias?: string
  empresa_id?: string
}
