import empresaRepository from '#repositories/empresa_repository'
import { ResendCompanyActivationEmailDTO, UpdateempresaDTO } from '#dtos/empresa_dto'
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { randomUUID } from 'node:crypto'
// import User from '#models/user'
import mail from '@adonisjs/mail/services/main'
// import emitter from '@adonisjs/core/services/emitter'
import verification_token_hashRepository from '#repositories/verification_token_hash_repository'
// import { Createverification_token_hashDTO } from '#dtos/verification_token_hash_dto'
// import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { CreateEmpresaUserDTO } from '#dtos/EmpresaUserDetalhes'

export default class empresaService {
  repo = new empresaRepository()
  verification_repo = new verification_token_hashRepository()
  list(page?: number, limit?: number) {
    return this.repo.paginate(page, limit)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: UpdateempresaDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }

  getUnverifiedCompanies() {
    return this.repo.getUnverifiedCompanies()
  }

  async create_account_with_detalhes(data: CreateEmpresaUserDTO) {
    return this.repo.CreateEmpresaUserDetalhes(data)
  }
  /**
   * Verifica e ativa uma empresa
   */
  async activateCompany(token: string) {
    return await this.verification_repo.verify(token)
  }

  async ResendVerificationEmail(data: ResendCompanyActivationEmailDTO) {
    return await this.verification_repo.ResendVerificationEmail(data)
  }
}
