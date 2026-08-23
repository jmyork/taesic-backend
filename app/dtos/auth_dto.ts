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
  username: string
  email: string
  password?: string
  company_alias: string
  papel: string | string[]
}
export interface logoutDTO {
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

/** Actualização de um funcionário. A password NUNCA entra aqui — é definida pelo
 * próprio através do link enviado por email no registo (ver `authRepository.create`).
 * Os papéis também não: são geridos pelo recurso `user-papeis`, que já existe. */
export interface UpdateUserDTO {
  company_alias: string
  user_id: string
  username?: string
  email?: string
}

export interface DeleteUserDTO {
  company_alias: string
  user_id: string
}

export interface ShowUserDetailsDTO {
  user_id: string
}
