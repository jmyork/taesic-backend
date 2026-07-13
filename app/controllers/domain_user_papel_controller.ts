import type { HttpContext } from '@adonisjs/core/http'
import DomainUserPapelService from '#services/domain_user_papel_service'
import { CreateDomainUserPapelValidator, DomainUserPapelQueryValidator } from '#validators/domain_user_papel_validator'

export default class DomainUserPapelController {
  private service = new DomainUserPapelService()

  // ==================== INDEX ====================
  // Lista as associações utilizador-papel dos utilizadores desta empresa.
  async index({ request, response, params }: HttpContext) {
    try {
      const qs = await DomainUserPapelQueryValidator.validate(request.qs())
      const data = await this.service.list({ ...qs, company_alias: params.company_alias })
      return response.ok({ data, message: 'Listagem realizada com sucesso', status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error('Erro ao listar papéis dos utilizadores:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== PAPEIS DISPONÍVEIS ====================
  // Papéis que este tenant pode atribuir aos seus próprios utilizadores (nunca papéis de plataforma).
  async papeisDisponiveis({ response }: HttpContext) {
    try {
      const data = await this.service.listAssignableRoles()
      return response.ok({ data, message: 'Listagem realizada com sucesso', status: 200 })
    } catch (error) {
      console.error('Erro ao listar papéis disponíveis:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== STORE ====================
  // Atribui um papel de domínio a um utilizador desta empresa.
  async store({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(CreateDomainUserPapelValidator)
      const data = await this.service.assign({ ...payload, company_alias: params.company_alias })
      return response.created({ data, message: 'Papel atribuído com sucesso', status: 201 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      if (error.code === 'USER_NOT_IN_COMPANY' || error.code === 'CANNOT_ASSIGN_PLATFORM_ROLE') {
        return response.status(error.status).send({ data: null, message: error.message, status: error.status })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ data: null, message: 'Utilizador ou papel não encontrado', status: 404 })
      }
      console.error('Erro ao atribuir papel:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== DESTROY ====================
  // Revoga uma atribuição de papel — apenas se o utilizador pertencer a esta empresa.
  async destroy({ params, response }: HttpContext) {
    try {
      await this.service.revoke({ id: params.id, company_alias: params.company_alias })
      return response.ok({ data: null, message: 'Papel revogado com sucesso', status: 200 })
    } catch (error: any) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ data: null, message: 'Registro não encontrado', status: 404 })
      }
      console.error('Erro ao revogar papel:', error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }
}
