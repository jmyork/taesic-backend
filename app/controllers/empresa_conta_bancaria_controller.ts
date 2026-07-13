import type { HttpContext } from '@adonisjs/core/http'
import empresa_conta_bancariaService from '#services/empresa_conta_bancaria_service'
import {
  createempresa_conta_bancariaValidator,
  updateempresa_conta_bancariaValidator,
} from '#validators/empresa_conta_bancaria_validator'

export default class empresa_conta_bancariasController {
  private service = new empresa_conta_bancariaService()

  // ==================== INDEX ====================
  async index({ request, response }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 20)

      const deleted = request.input('deleted', null)

      const data = await this.service.list(page, limit, deleted)

      return response.ok({
        data,
        message: 'Listagem realizada com sucesso',
        status: 200,
      })
    } catch (error) {
      console.error('Erro ao listar empresa_conta_bancaria:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  // ==================== STORE ====================
  async store({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createempresa_conta_bancariaValidator)
      const data = await this.service.create(payload)

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

      console.error('Erro ao criar empresa_conta_bancaria:', error)
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

      console.error('Erro ao buscar empresa_conta_bancaria:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  // ==================== UPDATE ====================
  async update({ params, request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(updateempresa_conta_bancariaValidator, {
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

      console.error('Erro ao atualizar empresa_conta_bancaria:', error)
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

      console.error('Erro ao remover empresa_conta_bancaria:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
}
