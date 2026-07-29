import type { HttpContext } from '@adonisjs/core/http'
import RelatoriosPlataformaService from '#services/relatorios_plataforma_service'
import { RelatoriosPlataformaFiltroValidator } from '#validators/relatorios_plataforma_validator'

// Relatórios do proprietário da plataforma — cross-tenant, deliberadamente sem
// company_alias (ver relatorios_plataforma_repository.ts). Rota de plataforma
// (adminOnly() + Bouncer, mesmo padrão de plano_controller.ts/taxa_iva_controller.ts —
// cada acção autoriza a sua própria ability, sempre por nome literal, nunca dinâmico).
export default class RelatoriosPlataformaController {
  private service = new RelatoriosPlataformaService()

  async contasReceber({ request, response, bouncer }: HttpContext) {
    try {
      await bouncer.with('RelatoriosPlataformaPolicy').authorize('contasReceber')
      const qs = await RelatoriosPlataformaFiltroValidator.validate(request.qs())
      const data = await this.service.contasReceber(qs)
      return response.ok({ data, message: 'Contas a receber calculadas com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao calcular contas a receber:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  async receitaPlataforma({ request, response, bouncer }: HttpContext) {
    try {
      await bouncer.with('RelatoriosPlataformaPolicy').authorize('receitaPlataforma')
      const qs = await RelatoriosPlataformaFiltroValidator.validate(request.qs())
      const data = await this.service.receitaPlataforma(qs)
      return response.ok({ data, message: 'Receita da plataforma calculada com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao calcular receita da plataforma:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  async empresasResumo({ response, bouncer }: HttpContext) {
    try {
      await bouncer.with('RelatoriosPlataformaPolicy').authorize('empresasResumo')
      const data = await this.service.empresasResumo()
      return response.ok({ data, message: 'Resumo de empresas calculado com sucesso', status: 200 })
    } catch (error) {
      console.error('Erro ao calcular resumo de empresas:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  async usoPlataforma({ request, response, bouncer }: HttpContext) {
    try {
      await bouncer.with('RelatoriosPlataformaPolicy').authorize('usoPlataforma')
      const qs = await RelatoriosPlataformaFiltroValidator.validate(request.qs())
      const data = await this.service.usoPlataforma(qs)
      return response.ok({ data, message: 'Uso da plataforma calculado com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao calcular uso da plataforma:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  async auditoria({ request, response, bouncer }: HttpContext) {
    try {
      await bouncer.with('RelatoriosPlataformaPolicy').authorize('auditoria')
      const qs = await RelatoriosPlataformaFiltroValidator.validate(request.qs())
      const data = await this.service.auditoria(qs)
      return response.ok({ data, message: 'Relatório de auditoria calculado com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao calcular relatório de auditoria:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }
}
