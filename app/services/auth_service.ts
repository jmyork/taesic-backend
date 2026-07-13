import authRepository from '#repositories/auth_repository'
import {
  ForgotPasswordDTO,
  ListUserDTO,
  LoginDTO,
  logoutDTO,
  RegisterDTO,
  resetPasswordDTO,
  ShowUserDetailsDTO,
  ShowUserDTO,
} from '#dtos/auth_dto'
// import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
// import db from '@adonisjs/lucid/services/db'

export default class authService {
  repo = new authRepository()
  async login(data: LoginDTO) {
    return await this.repo.login(data)
  }

  async logout(data: logoutDTO) {
    return await this.repo.logout(data)
  }

  async register(data: RegisterDTO) {
    return await this.repo.create(data)
  }
  async forgot_password(data: ForgotPasswordDTO) {
    return await this.repo.forgot_password(data)
  }

  async resetPassword(data: resetPasswordDTO) {
    return await this.repo.resetPassword(data)
  }

  async list(data: ListUserDTO) {
    return await this.repo.list(data)
  }
  async show(data: ShowUserDTO) {
    return await this.repo.show(data)
  }

  async details(data: ShowUserDetailsDTO) {
    return await this.repo.details(data)
  }
}
