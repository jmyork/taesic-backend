import type { HttpContext } from '@adonisjs/core/http'
import caixaService from '#services/caixa_service'
import {
  CaixaQueryValidator,
  OpenCaixaValidator,
  ToggleCaixaValidator,
} from '#validators/caixa_validator'
import { CaixaQueryDTO } from '#dtos/caixa_dto'

export default class caixasController {
  private service = new caixaService()
  // ==================== INDEX ====================
  async index({ request, response, params }: HttpContext) {
    try {
      const querySantized = await CaixaQueryValidator.validate(request.qs())
      const { page, limit, ...sanitezed } = querySantized

      const filter: CaixaQueryDTO = {
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

      console.error('Erro ao buscar caixa:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  // open caixa
  async store({ request, response, auth, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(OpenCaixaValidator, {
        meta: { user_id: auth.user?.id! },
      })
      const data = await this.service.open({
        ...payload,
        user_id: auth.user?.id!,
        company_alias: params.company_alias!,
      })

      return response.created({
        data,
        message: 'Caixa aberto com sucesso',
        status: 201,
      })
    } catch (error: any) {
      // Erro de validação do Vine

      if (error.code === 'CAIXA_ALREADY_OPEN') {
        return response.badRequest({
          data: null,
          message: error.message,
          status: 400,
        })
      }
      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }

      console.error('Erro ao abrir caixa:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  async destroy({ params, request, response, auth }: HttpContext) {
    try {
      const payload = await request.validateUsing(ToggleCaixaValidator)

      const data = await this.service.destroy(params.id, {
        ...payload,
        company_alias: params.company_alias!,
        user_id: auth.user?.id!,
      })

      const isOpen = data.status.toLocaleLowerCase() === 'aberto'

      return response.ok({
        data,
        message: isOpen ? 'Caixa reaberto com sucesso' : 'Caixa fechado com sucesso',
        status: 200,
      })
    } catch (error: any) {
      if (error.code === 'CAIXA_IS_ALREADY_OPEN') {
        return response.badRequest({
          data: null,
          message: error.message,
          status: 400,
        })
      }

      if (error.code === 'UNAUTHORIZED_CAIXA') {
        return response.unauthorized({
          data: null,
          message: error.message,
          status: 401,
        })
      }

      if (error.code === 'CAIXA_ALREADY_CLOSED') {
        return response.badRequest({
          data: null,
          message: error.message,
          status: 400,
        })
      }

      if (error.code === 'CAIXA_ALREADY_OPEN') {
        return response.badRequest({
          data: null,
          message: error.message,
          status: 400,
        })
      }
      // Erro de validação do Vine
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
          message: 'Registro não encontrado para reabertura',
          status: 404,
        })
      }

      console.error('Erro ao reabrir caixa:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  // meus caixas
  async myCaixas({ auth, request, response }: HttpContext) {
    try {
      const filter = await request.validateUsing(CaixaQueryValidator)
      const data = await this.service.listByUser(auth.user?.id!, filter)
      return response.ok({
        data,
        message: 'Listagem realizada com sucesso',
        status: 200,
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

      console.error('Erro ao listar meus caixas:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
}
