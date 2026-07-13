import type { HttpContext } from '@adonisjs/core/http'
import PromotorService from '#services/promotor_service'
import { createPromotorValidator, updatePromotorValidator } from '#validators/promotor_validator'
import { PromotorQueryDTO } from '#dtos/promotor_dto'

export default class PromotorController {
  private service = new PromotorService()

  // ==================== INDEX (gestão de promotores da empresa) ====================
  async index({ request, response, params }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 20)
      const filter: PromotorQueryDTO = {
        deleted: request.input('deleted') ?? undefined,
        company_alias: params.company_alias,
        incluir_plataforma: ['1', 'true'].includes(String(request.input('incluir_plataforma'))),
      }
      const data = await this.service.list(page, limit, filter)
      return response.ok({ data, message: 'Listagem realizada com sucesso', status: 200 })
    } catch (error) {
      console.error('Erro ao listar promotores:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== STORE (empresa regista o seu próprio promotor de domínio) ====================
  async store({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(createPromotorValidator)
      const data = await this.service.create({ ...payload, company_alias: params.company_alias })
      return response.created({ data, message: 'Promotor registado com sucesso', status: 201 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao criar promotor:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== REGISTO PÚBLICO (promotor de plataforma, auto-registo) ====================
  async registoPublico({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createPromotorValidator)
      const data = await this.service.create(payload)
      return response.created({
        data,
        message: 'Registo efetuado com sucesso. Guarde o seu link de perfil.',
        status: 201,
      })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao registar promotor de plataforma:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== SHOW ====================
  async show({ params, response }: HttpContext) {
    try {
      const data = await this.service.show(params.id, params.company_alias)
      return response.ok({ data, message: 'Registro encontrado', status: 200 })
    } catch (error: any) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ data: null, message: 'Registro não encontrado', status: 404 })
      }
      console.error('Erro ao buscar promotor:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== UPDATE (ex: desativar, editar nome/telefone) ====================
  async update({ params, request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(updatePromotorValidator)
      const data = await this.service.update(params.id, payload, params.company_alias)
      return response.ok({ data, message: 'Registro atualizado com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ data: null, message: 'Registro não encontrado para atualização', status: 404 })
      }
      console.error('Erro ao atualizar promotor:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== DESTROY ====================
  async destroy({ params, response }: HttpContext) {
    try {
      await this.service.delete(params.id, params.company_alias)
      return response.ok({ data: null, message: 'Registro removido/recuperado com sucesso', status: 200 })
    } catch (error: any) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ data: null, message: 'Registro não encontrado para remoção', status: 404 })
      }
      console.error('Erro ao remover promotor:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }
}
