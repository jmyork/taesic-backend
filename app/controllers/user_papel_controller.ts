import type { HttpContext } from '@adonisjs/core/http'
import user_papelService from '#services/user_papel_service'
import {
  createuser_papelValidator,
  // updateuser_papelValidator,
} from '#validators/user_papel_validator'

export default class user_papelsController {
  private service = new user_papelService()

  // ==================== INDEX ====================
  async index({ request, response, bouncer }: HttpContext) {
    try {
      await bouncer.with('UserPapelPolicy').authorize('index')

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
      console.error('Erro ao listar user_papel:', error)
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
      await bouncer.with('UserPapelPolicy').authorize('store')
      const payload = await request.validateUsing(createuser_papelValidator)
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

      console.error('Erro ao criar user_papel:', error)
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
      await bouncer.with('UserPapelPolicy').authorize('show')
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

      console.error('Erro ao buscar user_papel:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  // ==================== UPDATE ====================
  // async update({ params, request, response, bouncer,route }: HttpContext) {
  //   try {
  //     await bouncer.with('UserPapelPolicy').authorize('update')

  //     const payload = await request.validateUsing(updateuser_papelValidator)
  //     const data = await this.service.update(params.id, payload)

  //     return response.ok({
  //       data,
  //       message: 'Registro atualizado com sucesso',
  //       status: 200,
  //     })
  //   } catch (error: any) {
  //     // Erro de validação
  //     if (error.messages) {
  //       return response.badRequest({
  //         data: null,
  //         message: 'Dados inválidos',
  //         errors: error.messages,
  //         status: 400,
  //       })
  //     }

  //     // Registro não encontrado
  //     if (error.code === 'E_ROW_NOT_FOUND') {
  //       return response.notFound({
  //         data: null,
  //         message: 'Registro não encontrado para atualização',
  //         status: 404,
  //       })
  //     }

  //     console.error('Erro ao atualizar user_papel:', error)
  //     return response.internalServerError({
  //       data: null,
  //       message: 'Erro interno do servidor',
  //       status: 500,
  //     })
  //   }
  // }

  // ==================== DESTROY ====================
  async destroy({ params, response, bouncer }: HttpContext) {
    try {
      await bouncer.with('UserPapelPolicy').authorize('delete')
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

      console.error('Erro ao remover user_papel:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
}
