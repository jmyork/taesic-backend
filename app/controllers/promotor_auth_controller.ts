import type { HttpContext } from '@adonisjs/core/http'
import PromotorAuthService from '#services/promotor_auth_service'
import { confirmarOtpValidator, pedirOtpValidator } from '#validators/promotor_validator'

export default class PromotorAuthController {
  private service = new PromotorAuthService()

  async pedirOtp({ request, response }: HttpContext) {
    try {
      const { email } = await request.validateUsing(pedirOtpValidator)
      await this.service.pedirOtp(email)
      // Resposta genérica sempre — nunca revela se o email pertence a um promotor registado.
      return response.ok({
        data: null,
        message: 'Se o email corresponder a um promotor registado, enviámos um código de acesso.',
        status: 200,
      })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao pedir OTP de promotor:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  async confirmarOtp({ request, response }: HttpContext) {
    try {
      const { email, codigo } = await request.validateUsing(confirmarOtpValidator)
      const resultado = await this.service.confirmarOtp(email, codigo)
      if (!resultado) {
        return response.unauthorized({ data: null, message: 'Código inválido ou expirado.', status: 401 })
      }
      return response.ok({
        data: { token: resultado.token, promotor: resultado.promotor },
        message: 'Sessão iniciada com sucesso',
        status: 200,
      })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao confirmar OTP de promotor:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }
}
