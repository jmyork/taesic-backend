import type { HttpContext } from '@adonisjs/core/http'
import produtosService from '#services/produtos_service'
import {
  createprodutosValidator,
  CreateProdutoWithDetailsValidator,
  ProdutoQueryValidator,
  updateprodutosValidator,
} from '#validators/produtos_validator'
import { ProdutoQueryDTO } from '#dtos/produtos_dto'

// Erros de validação (VineJS), "registo não encontrado" (Lucid) e qualquer Exception de
// domínio (ex.: NotAllowedChangeIsServiceTagException) já são traduzidos de forma
// consistente pelo handler global (app/exceptions/handler.ts).
export default class produtossController {
  private service = new produtosService()

  // ==================== INDEX ====================
  async index({ request, params }: HttpContext) {
    const querySantized = await ProdutoQueryValidator.validate(request.qs())
    const { page, limit, ...sanitezed } = querySantized

    const filter: ProdutoQueryDTO = {
      ...sanitezed,
      empresa_id: params.company_alias ? null : request.input('empresa_id'),
      company_alias: params.company_alias,
    }
    const data = await this.service.list(page ?? 1, limit ?? 10, filter)
    return { data, message: 'Listagem realizada com sucesso', status: 200 }
  }

  // ==================== STORE ====================
  async store({ request, response, params, auth }: HttpContext) {
    const payload = await request.validateUsing(createprodutosValidator)
    const data = await this.service.create({
      ...payload,
      company_alias: params.company_alias,
      user_id: auth.user?.id,
    })
    return response.created({ data, message: 'Registro criado com sucesso', status: 201 })
  }

  // ==================== SHOW ====================
  async show({ params }: HttpContext) {
    const data = await this.service.show(params.id, params.company_alias)
    return { data, message: 'Registro encontrado', status: 200 }
  }

  // ==================== UPDATE ====================
  async update({ params, request, auth }: HttpContext) {
    const payload = await request.validateUsing(updateprodutosValidator, {
      meta: { id: params.id },
    })
    const data = await this.service.update(
      params.id,
      { ...payload, user_id: auth.user?.id },
      params.company_alias
    )
    return { data, message: 'Registro atualizado com sucesso', status: 200 }
  }

  // ==================== DESTROY ====================
  async destroy({ params }: HttpContext) {
    await this.service.delete(params.id, params.company_alias)
    return { data: null, message: 'Registro removido/recuperado com sucesso', status: 200 }
  }

  // ==================== REGISTRAR PRODUTO E DETALHES ====================
  // Regista um produto e, na mesma transação, os seus "adicionais": descrições,
  // categorias, contra-indicações e recomendações. Estava desligado (acção e rota
  // comentadas) — o service/repository já existiam e funcionavam, só nunca tinham sido
  // ligados a um pedido HTTP real.
  async registrar_produto_and_detalhes({ request, response, params, auth }: HttpContext) {
    const payload = await request.validateUsing(CreateProdutoWithDetailsValidator)
    const data = await this.service.registrarProdutoAndDetalhes({
      ...payload,
      produto: {
        ...payload.produto,
        company_alias: params.company_alias,
        user_id: auth.user?.id,
      },
    })
    return response.created({
      data,
      message: 'Produto e detalhes registrados com sucesso',
      status: 201,
    })
  }
}
