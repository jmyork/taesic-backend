import type { HttpContext } from '@adonisjs/core/http'
import DomainPapelService from '#services/domain_papel_service'
import {
  CreateDomainPapelValidator,
  DomainPapelQueryValidator,
  UpdateDomainPapelValidator,
} from '#validators/domain_papel_validator'

/**
 * Gestão dos papéis DA PRÓPRIA EMPRESA.
 *
 * Sem try/catch por acção, de propósito: o handler global
 * (`app/exceptions/handler.ts`) já traduz qualquer excepção de domínio para o
 * mesmo envelope. O padrão antigo de apanhar e reclassificar à mão é o que
 * escondeu, neste projecto, um 400 legítimo atrás de um 500 genérico assim que
 * apareceu uma excepção nova (ver `vendas_controller.close`).
 */
export default class DomainPapelController {
  private service = new DomainPapelService()

  async index({ request, response, params }: HttpContext) {
    const filtros = await request.validateUsing(DomainPapelQueryValidator)
    const data = await this.service.list({ ...filtros, company_alias: params.company_alias })
    return response.ok({ data, message: 'Listagem realizada com sucesso', status: 200 })
  }

  async show({ response, params }: HttpContext) {
    const data = await this.service.show({
      company_alias: params.company_alias,
      id: params.id,
    })
    return response.ok({ data, message: 'Papel encontrado', status: 200 })
  }

  /** O catálogo de permissões atribuíveis. Só leitura — o catálogo é do código. */
  async permissoesDisponiveis({ response }: HttpContext) {
    const data = await this.service.catalogoDePermissoes()
    return response.ok({ data, message: 'Listagem realizada com sucesso', status: 200 })
  }

  async store({ request, response, params }: HttpContext) {
    const payload = await request.validateUsing(CreateDomainPapelValidator)
    const data = await this.service.create({ ...payload, company_alias: params.company_alias })
    return response.created({ data, message: 'Papel criado com sucesso', status: 201 })
  }

  async update({ request, response, params }: HttpContext) {
    const payload = await request.validateUsing(UpdateDomainPapelValidator)
    const data = await this.service.update({
      ...payload,
      company_alias: params.company_alias,
      id: params.id,
    })
    return response.ok({ data, message: 'Papel actualizado com sucesso', status: 200 })
  }

  async destroy({ response, params }: HttpContext) {
    const data = await this.service.destroy({
      company_alias: params.company_alias,
      id: params.id,
    })
    const removido = data.deletedAt !== null
    return response.ok({
      data,
      message: removido ? 'Papel removido com sucesso' : 'Papel reposto com sucesso',
      status: 200,
    })
  }
}
