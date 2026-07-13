import type { HttpContext } from '@adonisjs/core/http'
import MetricasService from '#services/metricas_service'
import { MetricasPeriodoValidator } from '#validators/metricas_validator'

export default class MetricasController {
  private service = new MetricasService()

  // ==================== RESUMO ====================
  async resumo({ response, params }: HttpContext) {
    try {
      const data = await this.service.resumo({ company_alias: params.company_alias })
      return response.ok({ data, message: 'Resumo calculado com sucesso', status: 200 })
    } catch (error) {
      console.error('Erro ao calcular resumo de métricas:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== POSTOS ====================
  async postos({ request, response, params }: HttpContext) {
    try {
      const qs = await MetricasPeriodoValidator.validate(request.qs())
      const data = await this.service.porPosto({ ...qs, company_alias: params.company_alias })
      return response.ok({ data, message: 'Métricas por posto calculadas com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao calcular métricas por posto:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== VENDEDORES ====================
  async vendedores({ request, response, params }: HttpContext) {
    try {
      const qs = await MetricasPeriodoValidator.validate(request.qs())
      const data = await this.service.porVendedor({ ...qs, company_alias: params.company_alias })
      return response.ok({ data, message: 'Métricas por vendedor calculadas com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao calcular métricas por vendedor:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== POR DIA ====================
  async porDia({ request, response, params }: HttpContext) {
    try {
      const qs = await MetricasPeriodoValidator.validate(request.qs())
      const data = await this.service.porDia({ ...qs, company_alias: params.company_alias })
      return response.ok({ data, message: 'Métricas por dia calculadas com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao calcular métricas por dia:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== IMPACTO DOS PROMOTORES (visto pela empresa, não pelo promotor) ====================
  async promotoresResumo({ request, response, params }: HttpContext) {
    try {
      const qs = await MetricasPeriodoValidator.validate(request.qs())
      const data = await this.service.promotoresResumo({ ...qs, company_alias: params.company_alias })
      return response.ok({ data, message: 'Resumo de promotores calculado com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao calcular resumo de promotores:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  async promotoresPorPromotor({ request, response, params }: HttpContext) {
    try {
      const qs = await MetricasPeriodoValidator.validate(request.qs())
      const data = await this.service.promotoresPorPromotor({ ...qs, company_alias: params.company_alias })
      return response.ok({ data, message: 'Métricas por promotor calculadas com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao calcular métricas por promotor:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  async promotoresPorProduto({ request, response, params }: HttpContext) {
    try {
      const qs = await MetricasPeriodoValidator.validate(request.qs())
      const data = await this.service.promotoresPorProduto({ ...qs, company_alias: params.company_alias })
      return response.ok({ data, message: 'Produtos por promotor calculados com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao calcular produtos por promotor:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }
}
