import type { HttpContext } from '@adonisjs/core/http'
import metodopagamentoService from '#services/metodopagamento_service'
import {
  createmetodopagamentoValidator,
  updatemetodopagamentoValidator,
  MetodoPagamentoQueryValidator,
} from '#validators/metodopagamento_validator'
import { MetodoPagamentoQueryDTO } from '#dtos/metodopagamento_dto'

export default class metodopagamentosController {
  private service = new metodopagamentoService()

  // ==================== INDEX ====================
  async index({ request, response, bouncer }: HttpContext) {
    try {
      await bouncer.with('MetodoPagamentoPolicy').authorize('index')
      const querySantized = await MetodoPagamentoQueryValidator.validate(request.qs())
      const { page, limit, ...sanitezed } = querySantized

      const filter: MetodoPagamentoQueryDTO = {
        ...sanitezed,
      }
      const data = await this.service.list(page ?? 1, limit ?? 10, filter)
      return response.ok({
        data,
        message: 'Listagem realizada com sucesso',
        status: 200,
      })
    } catch (error: any) {
      console.log(error)
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
  async store({ request, response, bouncer }: HttpContext) {
    try {
      await bouncer.with('MetodoPagamentoPolicy').authorize('store')
      const payload = await request.validateUsing(createmetodopagamentoValidator)
      const data = await this.service.create({ ...payload })

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
  async show({ params, response, bouncer }: HttpContext) {
    try {
      await bouncer.with('MetodoPagamentoPolicy').authorize('show')
      const data = await this.service.show(params.id)

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
  // ==================== UPDATE ====================
  async update({ params, request, response, bouncer }: HttpContext) {
    try {
      await bouncer.with('MetodoPagamentoPolicy').authorize('update')
      const payload = await request.validateUsing(updatemetodopagamentoValidator, {
        meta: {
          id: params.id,
        },
      })
      const data = await this.service.update(params.id, payload)

      return response.ok({
        data,
        message: 'Registro atualizado com sucesso',
        status: 200,
      })
    } catch (error: any) {
      // Erro de validação
      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }

      // Registro não encontrado
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          data: null,
          message: 'Registro não encontrado para atualização',
          status: 404,
        })
      }

      console.error('Erro ao atualizar marca:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
  // ==================== DESTROY ====================
  async destroy({ params, response, bouncer }: HttpContext) {
    try {
      await bouncer.with('MetodoPagamentoPolicy').authorize('delete')
      await this.service.delete(params.id)

      return response.ok({
        data: null,
        message: 'Registro removido/recuperado com sucesso',
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
