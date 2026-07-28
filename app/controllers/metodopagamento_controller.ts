import type { HttpContext } from '@adonisjs/core/http'
import metodopagamentoService from '#services/metodopagamento_service'
import {
  createmetodopagamentoValidator,
  updatemetodopagamentoValidator,
  MetodoPagamentoQueryValidator,
} from '#validators/metodopagamento_validator'
import { MetodoPagamentoQueryDTO } from '#dtos/metodopagamento_dto'

// Recurso de domínio (isolado por company_alias) — autorização é feita por
// `permission_middleware` (domain_metodo_pagamento.*), não por Bouncer. Erros de validação,
// "registo não encontrado" e excepções de domínio já são traduzidos pelo handler global.
export default class metodopagamentosController {
  private service = new metodopagamentoService()

  // ==================== INDEX ====================
  async index({ request, params }: HttpContext) {
    const querySantized = await MetodoPagamentoQueryValidator.validate(request.qs())
    const { page, limit, ...sanitezed } = querySantized

    const filter: MetodoPagamentoQueryDTO = {
      ...sanitezed,
      empresa_id: params.company_alias ? null : request.input('empresa_id'),
      company_alias: params.company_alias,
    }
    const data = await this.service.list(page ?? 1, limit ?? 10, filter)
    return { data, message: 'Listagem realizada com sucesso', status: 200 }
  }

  // ==================== STORE ====================
  async store({ request, response, params }: HttpContext) {
    const payload = await request.validateUsing(createmetodopagamentoValidator)
    const data = await this.service.create({ ...payload, company_alias: params.company_alias })
    return response.created({ data, message: 'Registro criado com sucesso', status: 201 })
  }

  // ==================== SHOW ====================
  async show({ params }: HttpContext) {
    const data = await this.service.show(params.id, params.company_alias)
    return { data, message: 'Registro encontrado', status: 200 }
  }

  // ==================== UPDATE ====================
  async update({ params, request }: HttpContext) {
    const payload = await request.validateUsing(updatemetodopagamentoValidator, {
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
