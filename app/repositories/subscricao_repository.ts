import subscricao from '#models/subscricao'
import { CreatesubscricaoDTO, UpdatesubscricaoDTO } from '#dtos/subscricao_dto'
import BaseRepository from './base_repository.js'

export default class subscricaoRepository extends BaseRepository<
  InstanceType<typeof subscricao>,
  CreatesubscricaoDTO,
  UpdatesubscricaoDTO
> {
  constructor() {
    super(subscricao, 'subscricao')
  }

  // `subscricao.cliente_id` referencia `empresa.id` (nome de coluna enganoso, mas é o FK real).
  protected scopeToTenant(query: any, companyAlias: string) {
    return query
      .join('empresa', 'empresa.id', 'subscricao.cliente_id')
      .where('empresa.company_alias', companyAlias)
  }
}
