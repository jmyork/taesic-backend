import type { HttpContext } from '@adonisjs/core/http'
import produto_fabricantesService from '#services/produto_fabricantes_service'
import {
  createproduto_fabricantesValidator,
  updateproduto_fabricantesValidator,
  ProdutoFabricanteQueryValidator,
} from '#validators/produto_fabricantes_validator'
import { ProdutoFabricanteQueryDTO } from '#dtos/produto_fabricantes_dto'

export default class produto_fabricantessController {
  private service = new produto_fabricantesService()

  // ==================== INDEX ====================
  async index({ request, params }: HttpContext) {
    const querySantized = await ProdutoFabricanteQueryValidator.validate(request.qs())
    const { page, limit, ...sanitezed } = querySantized

    const filter: ProdutoFabricanteQueryDTO = {
      ...sanitezed,
      empresa_id: params.company_alias ? null : request.input('empresa_id'),
      company_alias: params.company_alias,
    }
    const data = await this.service.list(page ?? 1, limit ?? 10, filter)
    return { data, message: 'Listagem realizada com sucesso', status: 200 }
  }

  // ==================== STORE ====================
  async store({ request, response, params }: HttpContext) {
    const payload = await request.validateUsing(createproduto_fabricantesValidator)
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
    const payload = await request.validateUsing(updateproduto_fabricantesValidator, {
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
