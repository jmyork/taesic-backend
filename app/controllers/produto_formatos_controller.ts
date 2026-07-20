import type { HttpContext } from '@adonisjs/core/http'
import produto_formatosService from '#services/produto_formatos_service'
import {
  createproduto_formatosValidator,
  ProdutoFormatoQueryValidator,
  updateproduto_formatosValidator,
} from '#validators/produto_formatos_validator'
import { ProdutoFormatoQueryDTO } from '#dtos/produto_formatos_dto'

export default class produto_formatossController {
  private service = new produto_formatosService()

  // ==================== INDEX ====================
  async index({ request, params }: HttpContext) {
    const querySantized = await ProdutoFormatoQueryValidator.validate(request.qs())
    const { page, limit, ...sanitezed } = querySantized

    const filter: ProdutoFormatoQueryDTO = {
      ...sanitezed,
      empresa_id: params.company_alias ? null : request.input('empresa_id'),
      company_alias: params.company_alias,
    }
    const data = await this.service.list(page ?? 1, limit ?? 10, filter)
    return { data, message: 'Listagem realizada com sucesso', status: 200 }
  }

  // ==================== STORE ====================
  async store({ request, response, params }: HttpContext) {
    const payload = await request.validateUsing(createproduto_formatosValidator)
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
    const payload = await request.validateUsing(updateproduto_formatosValidator, {
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
