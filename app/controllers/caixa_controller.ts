import type { HttpContext } from '@adonisjs/core/http'
import caixaService from '#services/caixa_service'
import {
  CaixaQueryValidator,
  OpenCaixaValidator,
  ToggleCaixaValidator,
} from '#validators/caixa_validator'
import { CaixaQueryDTO } from '#dtos/caixa_dto'

// Erros de validação (VineJS), excepções de domínio (CaixaAlreadyOpenException,
// UnAuthorizedCaixaException, etc.) e "registo não encontrado" (Lucid) já são traduzidos
// de forma consistente pelo handler global (app/exceptions/handler.ts) — não é preciso
// repetir `if (error.code === 'X') {...}` em cada acção.
export default class caixasController {
  private service = new caixaService()

  // ==================== INDEX ====================
  async index({ request, params }: HttpContext) {
    const querySantized = await CaixaQueryValidator.validate(request.qs())
    const { page, limit, ...sanitezed } = querySantized

    const filter: CaixaQueryDTO = {
      ...sanitezed,
      empresa_id: params.company_alias ? null : request.input('empresa_id'),
      company_alias: params.company_alias,
    }
    const data = await this.service.list(page ?? 1, limit ?? 10, filter)
    return { data, message: 'Listagem realizada com sucesso', status: 200 }
  }

  // ==================== SHOW ====================
  async show({ params }: HttpContext) {
    const data = await this.service.show(params.id)
    return { data, message: 'Registro encontrado', status: 200 }
  }

  // open caixa
  async store({ request, response, auth, params }: HttpContext) {
    const payload = await request.validateUsing(OpenCaixaValidator, {
      meta: { user_id: auth.user?.id! },
    })
    const data = await this.service.open({
      ...payload,
      user_id: auth.user?.id!,
      company_alias: params.company_alias!,
    })

    return response.created({ data, message: 'Caixa aberto com sucesso', status: 201 })
  }

  async destroy({ params, request, auth }: HttpContext) {
    const payload = await request.validateUsing(ToggleCaixaValidator)

    const data = await this.service.destroy(params.id, {
      ...payload,
      company_alias: params.company_alias!,
      user_id: auth.user?.id!,
    })

    const isOpen = data.status.toLocaleLowerCase() === 'aberto'

    return {
      data,
      message: isOpen ? 'Caixa reaberto com sucesso' : 'Caixa fechado com sucesso',
      status: 200,
    }
  }

  // meus caixas
  async myCaixas({ auth, request }: HttpContext) {
    const filter = await request.validateUsing(CaixaQueryValidator)
    const data = await this.service.listByUser(auth.user?.id!, filter)
    return { data, message: 'Listagem realizada com sucesso', status: 200 }
  }
}
