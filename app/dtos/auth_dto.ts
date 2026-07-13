import { CreatedDtStart, UpdatedDtEnd, CreatedDtEnd, UpdatedDtStart } from './aux_dto.js'
import { DeletedValue } from '../helpers/Types.js'
export interface AuthQueryDTO {
  DeletedValue?: DeletedValue
  CreatedDtStart?: CreatedDtStart
  UpdatedDtEnd?: UpdatedDtEnd
  CreatedDtEnd?: CreatedDtEnd
  UpdatedDtStart?: UpdatedDtStart

  username?: string
  email?: string
  empresa_id?: string
}
export interface LoginDTO {
  uid: string // email ou username
  password: string
  company_alias?: string
}

export interface ForgotPasswordDTO {
  email: string
  company_alias: string
}
export interface RegisterDTO {
  enabled?: boolean
  username: string
  email: string
  password?: string
  company_alias: string
  papel: string | string[]
}
export interface logoutDTO {
  enabled?: boolean
  userId: string
  token_identifier: number
}
export interface resetPasswordDTO {
  password: string
  token: string
  email: string
}

export interface ListUserDTO {
  page?: number
  limit?: number
  query?: string
  created_at?: Date
  deleted_at?: Date
  updated_at?: Date
  company_alias?: string
}

export interface ShowUserDTO {
  company_alias: string
  user_id: string
}

export interface ShowUserDetailsDTO {
  user_id: string
}
