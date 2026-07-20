import type { HttpContext } from '@adonisjs/core/http'
import produto_mediaService from '#services/produto_media_service'
import {
  createproduto_mediaValidator,
  ProdutoImagemQueryValidator,
} from '#validators/produto_media_validator'
import { ProdutoDescricaoQueryDTO } from '#dtos/produto_descricao_dto'

export default class produto_mediasController {
  private service = new produto_mediaService()

  // ==================== INDEX ====================
  async index({ request, response, params }: HttpContext) {
    try {
      const querySantized = await ProdutoImagemQueryValidator.validate(request.qs())
      const { page, limit, ...sanitezed } = querySantized

      const filter: ProdutoDescricaoQueryDTO = {
        ...sanitezed,
        empresa_id: params.company_alias ? null : request.input('empresa_id'),
        company_alias: params.company_alias,
      }
      const data = await this.service.list(page ?? 1, limit ?? 10, filter)
      return response.ok({
        data,
        message: 'Listagem realizada com sucesso',
        status: 200,
      })
    } catch (error: any) {
      //console.log(error)
      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }
      // console.error('Erro ao listar marca:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
  // ==================== STORE ====================
  async store({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(createproduto_mediaValidator)
      const data = await this.service.create({ ...payload, company_alias: params.company_alias })

      return response.created({
        data,
        message: 'Registro criado com sucesso',
        status: 201,
      })
    } catch (error: any) {
      // Erro de validação do Vine
      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }

      console.error('Erro ao criar marca:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
  // ==================== SHOW ====================
  async show({ params, response }: HttpContext) {
    try {
      const data = await this.service.show(params.id, params.company_alias)

      return response.ok({
        data,
        message: 'Registro encontrado',
        status: 200,
      })
    } catch (error: any) {
      // Captura erro de registro não encontrado (Lucid)
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          data: null,
          message: 'Registro não encontrado',
          status: 404,
        })
      }

      console.error('Erro ao buscar marca:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
  // ==================== DESTROY ====================
  async destroy({ params, response }: HttpContext) {
    try {
      await this.service.delete(params.id, params.company_alias)

      return response.ok({
        data: null,
        message: 'Registro removido com sucesso',
        status: 200,
      })
    } catch (error: any) {
      // Registro não encontrado
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          data: null,
          message: 'Registro não encontrado para remoção',
          status: 404,
        })
      }

      console.error('Erro ao remover marca:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
}
