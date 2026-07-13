import type { HttpContext } from '@adonisjs/core/http'
import PromotorAuthService from '#services/promotor_auth_service'
import PromotorPainelService from '#services/promotor_painel_service'

const authService = new PromotorAuthService()

/** Extrai e valida o Bearer token do promotor — este painel não usa o guard de `User`,
 * por isso não passa pelo `permission_middleware`/`auth_middleware` do resto da API. */
async function resolvePromotor(request: HttpContext['request']) {
  const authHeader = request.header('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null
  if (!token) return null
  return authService.promotorPorToken(token)
}

export default class PromotorPainelController {
  private service = new PromotorPainelService()

  async resumo({ request, response }: HttpContext) {
    const promotor = await resolvePromotor(request)
    if (!promotor) {
      return response.unauthorized({ data: null, message: 'Sessão inválida ou expirada.', status: 401 })
    }
    const data = await this.service.resumo(promotor.id)
    return response.ok({ data, message: 'Resumo calculado com sucesso', status: 200 })
  }

  async produtos({ request, response }: HttpContext) {
    const promotor = await resolvePromotor(request)
    if (!promotor) {
      return response.unauthorized({ data: null, message: 'Sessão inválida ou expirada.', status: 401 })
    }
    const data = await this.service.produtos(promotor.id)
    return response.ok({ data, message: 'Produtos calculados com sucesso', status: 200 })
  }
}
