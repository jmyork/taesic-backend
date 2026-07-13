import VerificationTokenHash from '#models/verification_token_hash'
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { randomUUID } from 'node:crypto'
import { TransactionClientContract } from '@adonisjs/lucid/types/database'

export default class VerificationTokenHashService {
  /**
   * Lista tokens com paginação
   */
  async paginate(page: number = 1, limit: number = 20) {
    return await VerificationTokenHash.query().where('deletedAt', null).paginate(page, limit)
  }

  /**
   * Busca token por ID
   */
  async findById(id: string) {
    return await VerificationTokenHash.findOrFail(id)
  }

  /**
   * Cria novo token de verificação
   */
  async createToken(
    data: {
      user_id?: string | null
      empresa_id?: string | null
      purpose:
        | 'purpose'
        | 'account_activation'
        | 'account_activation_reply_token'
        | 'password_recovery'
    },
    trx?: any
  ) {
    const publicToken = randomUUID()

    const hashedToken = await hash.make(publicToken)

    const expiresAt = DateTime.now().plus({ hours: 24 })

    const query = VerificationTokenHash

    const tokenRecord = new query()
    tokenRecord.user_id = data.user_id || null
    tokenRecord.empresa_id = data.empresa_id || null
    tokenRecord.verification_token_public = publicToken
    tokenRecord.verification_token_hash = hashedToken
    tokenRecord.verification_token_expires_at = expiresAt
    tokenRecord.verified = false
    tokenRecord.purpose = data.purpose

    if (trx) {
      tokenRecord.useTransaction(trx)
    }

    await tokenRecord.save()

    return {
      id: tokenRecord.id,
      token: publicToken,
      expires_at: expiresAt,
      message: 'Token criado com sucesso',
    }
  }

  /**
   * Verifica se um token é válido
   */
  async verifyToken(tokenPublic: string) {
    const now = DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')

    const token = await VerificationTokenHash.query()
      .where('verification_token_public', tokenPublic)
      .where('verified', false)

      .where('purpose', 'account_activation')
      .where('verification_token_expires_at', '>=', now)
      .firstOrFail()

    await token.related('user').query().update({ enabled: true }).first()
    await token.related('empresa').query().update({ verified: true, enabled: true }).first()

    // 🔒 Atualiza depois (não uses update direto com firstOrFail)
    token.verified = true
    await token.save()

    return token
  }

  /**
   * Marca token como verificado/usado
   */
  async markAsVerified(tokenId: string) {
    const tokenRecord = await this.findById(tokenId)
    tokenRecord.verified = true
    await tokenRecord.save()
    return tokenRecord
  }
  /**
   * Deleta um token
   */
  async delete(id: string) {
    const token = await this.findById(id)
    await token.delete()
  }

  /**
   * Remove tokens expirados
   */
  async cleanExpired(): Promise<number> {
    const now = DateTime.now().toSQL()

    const result = await VerificationTokenHash.query()
      .where('verified', false)
      .where('verification_token_expires_at', '<', now)
      .delete()

    return result
  }

  /**
   * Busca tokens de um usuário
   */
  async findByUser(userId: string, page: number = 1, limit: number = 10) {
    return await VerificationTokenHash.query()
      .where('user_id', userId)
      .where('deletedAt', null)
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }

  /**
   * Busca tokens de uma empresa
   */
  async findByCompany(empresaId: string, page: number = 1, limit: number = 10) {
    return await VerificationTokenHash.query()
      .where('empresa_id', empresaId)
      .where('deletedAt', null)
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }

  /**
   * Busca tokens não verificados que ainda são válidos
   */
  async findValidTokens(userId?: string, empresaId?: string) {
    const now = DateTime.now().toSQL()

    let query = VerificationTokenHash.query()
      .where('verified', false)
      .where('verification_token_expires_at', '>', now)
      .where('deletedAt', null)

    if (userId) {
      query = query.where('user_id', userId)
    }

    if (empresaId) {
      query = query.where('empresa_id', empresaId)
    }

    return await query.exec()
  }

  /**
   * Remove todos os tokens de um usuário
   */
  async deleteUserTokens(userId: string) {
    return await VerificationTokenHash.query().where('user_id', userId).delete()
  }

  /**
   * Remove todos os tokens de uma empresa
   */
  async deleteCompanyTokens(empresaId: string) {
    return await VerificationTokenHash.query().where('empresa_id', empresaId).delete()
  }
}
