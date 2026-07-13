import type { HttpContext } from '@adonisjs/core/http'
import FacturaService from '#services/factura_service'
import { EmitirFacturaValidator, FacturaQueryValidator } from '#validators/factura_validator'

export default class FacturaController {
  private service = new FacturaService()

  // ==================== INDEX ====================
  async index({ request, response, params }: HttpContext) {
    try {
      const qs = await FacturaQueryValidator.validate(request.qs())
      const data = await this.service.list({ ...qs, company_alias: params.company_alias })
      return response.ok({ data, message: 'Listagem realizada com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao listar facturas:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== SHOW ====================
  async show({ params, response }: HttpContext) {
    try {
      const data = await this.service.show({ id: params.id, company_alias: params.company_alias })
      return response.ok({ data, message: 'Registro encontrado', status: 200 })
    } catch (error: any) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ data: null, message: 'Registro não encontrado', status: 404 })
      }
      console.error('Erro ao buscar factura:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== STORE (emitir) ====================
  async store({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(EmitirFacturaValidator)
      const data = await this.service.emitir({ ...payload, company_alias: params.company_alias })
      return response.created({ data, message: 'Factura emitida com sucesso', status: 201 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      if (error.code === 'VENDA_NAO_FECHADA') {
        return response.status(error.status).send({ data: null, message: error.message, status: error.status })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ data: null, message: 'Venda não encontrada', status: 404 })
      }
      console.error('Erro ao emitir factura:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== ANULAR ====================
  async anular({ params, response }: HttpContext) {
    try {
      const data = await this.service.anular({ id: params.id, company_alias: params.company_alias })
      return response.ok({ data, message: 'Factura anulada com sucesso', status: 200 })
    } catch (error: any) {
      if (error.code === 'FACTURA_JA_ANULADA') {
        return response.status(error.status).send({ data: null, message: error.message, status: error.status })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ data: null, message: 'Registro não encontrado', status: 404 })
      }
      console.error('Erro ao anular factura:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }
}
