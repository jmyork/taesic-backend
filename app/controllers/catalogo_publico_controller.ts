import type { HttpContext } from '@adonisjs/core/http'
import CatalogoPublicoRepository from '#repositories/catalogo_publico_repository'
import PromotorRepository from '#repositories/promotor_repository'
import LeadRepository from '#repositories/lead_repository'

export default class CatalogoPublicoController {
  private catalogoRepo = new CatalogoPublicoRepository()
  private promotorRepo = new PromotorRepository()
  private leadRepo = new LeadRepository()

  // ==================== GET /catalogo/produtos (público, cross-tenant) ====================
  async produtos({ request, response }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 20)
      const search = request.input('q') || undefined
      const data = await this.catalogoRepo.paginateProdutos(page, limit, search)
      return response.ok({ data, message: 'Catálogo carregado com sucesso', status: 200 })
    } catch (error) {
      console.error('Erro ao carregar catálogo público:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== GET /p/:codigo_perfil (perfil público do promotor + registo de lead) ====================
  async perfil({ params, response }: HttpContext) {
    try {
      const promotor = await this.promotorRepo.findByCodigoPerfil(params.codigo_perfil)
      if (!promotor || !promotor.ativo) {
        return response.notFound({ data: null, message: 'Perfil não encontrado', status: 404 })
      }

      await this.leadRepo.registar(promotor.id, promotor.empresa_id)

      return response.ok({
        data: {
          nome: promotor.nome,
          is_plataforma: promotor.isPlataforma,
          empresa: promotor.empresa_id ? await promotor.related('empresa').query().select('nome').first() : null,
        },
        message: 'Perfil carregado com sucesso',
        status: 200,
      })
    } catch (error) {
      console.error('Erro ao carregar perfil público de promotor:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }
}
