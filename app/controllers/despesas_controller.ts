import type { HttpContext } from '@adonisjs/core/http'
import despesasService from '#services/despesas_service'
import {
  createdespesasValidator,
  updatedespesasValidator,
  DespesasQueryValidator,
} from '#validators/despesas_validator'
import { DespesasQueryDTO } from '#dtos/despesas_dto'

// Recurso de domínio (isolado por company_alias) — autorização via permission_middleware
// (domain_despesas.*), sem Bouncer. Erros de validação, "registo não encontrado" e
// excepções de domínio já são traduzidos pelo handler global.
export default class despesasController {
  private service = new despesasService()

  // ==================== INDEX ====================
  async index({ request, params }: HttpContext) {
    const querySantized = await DespesasQueryValidator.validate(request.qs())
    const { page, limit, ...sanitezed } = querySantized

    const filter: DespesasQueryDTO = {
      ...sanitezed,
      empresa_id: params.company_alias ? null : request.input('empresa_id'),
      company_alias: params.company_alias,
    }
    const data = await this.service.list(page ?? 1, limit ?? 20, filter)
    return { data, message: 'Listagem realizada com sucesso', status: 200 }
  }

  // ==================== STORE ====================
  async store({ request, response, params, auth }: HttpContext) {
    const payload = await request.validateUsing(createdespesasValidator)
    const data = await this.service.create({
      ...payload,
      company_alias: params.company_alias,
      registrado_por: auth.user?.id,
    })
    return response.created({ data, message: 'Registro criado com sucesso', status: 201 })
  }

  // ==================== SHOW ====================
  async show({ params }: HttpContext) {
    const data = await this.service.show(params.id, params.company_alias)
    return { data, message: 'Registro encontrado', status: 200 }
  }

  // ==================== UPDATE ====================
  async update({ params, request }: HttpContext) {
    const payload = await request.validateUsing(updatedespesasValidator, {
      meta: { id: params.id },
    })
    const data = await this.service.update(params.id, payload, params.company_alias)
    return { data, message: 'Registro atualizado com sucesso', status: 200 }
  }

  // ==================== DESTROY ====================
  async destroy({ params }: HttpContext) {
    await this.service.delete(params.id, params.company_alias)
    return { data: null, message: 'Registro removido/recuperado com sucesso', status: 200 }
  }
}
