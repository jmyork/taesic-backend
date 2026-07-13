import type { HttpContext } from '@adonisjs/core/http'
import produtos_reembolsoService from '#services/produtos_reembolso_service'
import {
  ReembolsoParcialValidator,
  ReembolsoTotalValidator,
  ProdutosReembolsoQueryValidator,
  ShowProdutosReembolsoValidator
} from '#validators/produtos_reembolso_validator'
import { ProdutosReembolsoQueryDTO } from '#dtos/produtos_reembolso_dto'

export default class produtos_reembolsosController {
  private service = new produtos_reembolsoService()

  // ==================== INDEX ====================
  async index({ request, response, params }: HttpContext) {
    try {
      const querySantized = await ProdutosReembolsoQueryValidator.validate(request.qs())
      const { page, limit, ...sanitezed } = querySantized

      const filter: ProdutosReembolsoQueryDTO = {
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
  async show({ params, response, auth }: HttpContext) {
    try {
      const payload = await ShowProdutosReembolsoValidator.validate(params)
      const data = await this.service.show({ ...payload, company_alias: params.company_alias, user_id: auth.user?.id! })

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

  // ==================== REEMBOLSO TOTAL ====================
  async reembolsar_total({ params, response, auth, request }: HttpContext) {
    try {
      const payload = await request.validateUsing(ReembolsoTotalValidator)
      const data = await this.service.reembolsar_total({ ...payload, company_alias: params.company_alias, user_id: auth.user?.id! })

      return response.ok({
        data,
        message: 'Reembolso total realizado com sucesso',
        status: 200,
      })
    } catch (error: any) {
      if (error.code === 'E_VALIDATION_ERROR') {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }
      console.error('Erro ao realizar reembolso total:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  // ==================== REEMBOLSO PARCIAL ====================
  async reembolsar_parcial({ params, response, auth, request }: HttpContext) {
    try {
      const payload = await request.validateUsing(ReembolsoParcialValidator)
      const data = await this.service.reembolsar_parcial({ ...payload, company_alias: params.company_alias, user_id: auth.user?.id! })

      return response.ok({
        data,
        message: 'Reembolso parcial realizado com sucesso',
        status: 200,
      })
    } catch (error: any) {
      console.error('Erro ao realizar reembolso parcial:', error)
      if (error.code === 'E_VALIDATION_ERROR') {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }
      if (error.code === "REFUND_QUANTITY_EXCEEDS_SOLD") {
        return response.badRequest({
          data: null,
          message: error.message,
          status: error.code,
        })
      }
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
}
