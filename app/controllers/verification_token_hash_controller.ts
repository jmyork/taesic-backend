import type { HttpContext } from '@adonisjs/core/http'
import VerificationTokenHashService from '#services/verification_token_hash_service'
import {
  createVerificationTokenValidator,
  verifyTokenValidator,
} from '#validators/verification_token_hash_validator'
import VerificationTokenHash from '#models/verification_token_hash'
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'

export default class VerificationTokenHashController {
  private service = new VerificationTokenHashService()

  // ==================== VERIFICAR TOKEN ====================
  /**
   * Verifica se um token é válido
   * POST /verification-token/verify
   * Body: { token: "xxxxx" }
   */
  async verify({ params, response }: HttpContext) {
    try {
      // const { token } = await request.validateUsing(verifyTokenValidator)
      const verified = await this.service.verifyToken(params.token)
      return response.ok({
        data: null,
        message: 'Activação da conta realizada com sucesso',
        status: 200,
      })
    } catch (error: any) {
      const statusCode = error.message?.includes('expirado') ? 410 : 400

      console.error('Erro ao verificar token:', error)
      return response.notFound({
        data: { valid: false },
        message: 'Token Não encontrado, expirado ou já verificado',
        status: statusCode,
      })
    }
  }

  // ==================== ATIVAR VERIFICAÇÃO ====================
  /**
   * Marca o token como verificado/usado
   * POST /verification-token/:id/activate
   */
  async activate({ params, response }: HttpContext) {
    try {
      const tokenRecord = await this.service.findById(params.id)

      if (tokenRecord.verified) {
        return response.badRequest({
          message: 'Este token já foi verificado',
          status: 400,
        })
      }

      const updated = await this.service.markAsVerified(params.id)

      return response.ok({
        data: updated,
        message: 'Token ativado com sucesso',
        status: 200,
      })
    } catch (error: any) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          data: null,
          message: 'Token não encontrado',
          status: 404,
        })
      }

      console.error('Erro ao ativar token:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro ao ativar token',
        status: 500,
      })
    }
  }

  // ==================== LIMPAR TOKENS EXPIRADOS ====================
  /**
   * Remove todos os tokens expirados
   * POST /verification-token/cleanup
   */
  async cleanup({ response }: HttpContext) {
    try {
      const count = await this.service.cleanExpired()

      return response.ok({
        data: { deleted_count: count },
        message: `${count} token(s) expirado(s) removido(s)`,
        status: 200,
      })
    } catch (error) {
      console.error('Erro ao limpar tokens:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro ao limpar tokens expirados',
        status: 500,
      })
    }
  }

  // ==================== LISTAR TOKENS DE UM USUÁRIO ====================
  async byUser({ params, request, response }: HttpContext) {
    try {
      const { userId } = params
      const page = request.input('page', 1)
      const limit = request.input('limit', 10)

      const tokens = await this.service.findByUser(userId, page, limit)

      return response.ok({
        data: tokens,
        message: 'Tokens do usuário listados',
        status: 200,
      })
    } catch (error) {
      console.error('Erro ao listar tokens do usuário:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro ao listar tokens',
        status: 500,
      })
    }
  }

  // ==================== LISTAR TOKENS DE UMA EMPRESA ====================
  async byCompany({ params, request, response }: HttpContext) {
    try {
      const { empresaId } = params
      const page = request.input('page', 1)
      const limit = request.input('limit', 10)

      const tokens = await this.service.findByCompany(empresaId, page, limit)

      return response.ok({
        data: tokens,
        message: 'Tokens da empresa listados',
        status: 200,
      })
    } catch (error) {
      console.error('Erro ao listar tokens da empresa:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro ao listar tokens',
        status: 500,
      })
    }
  }
}
