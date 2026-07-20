import cobranca from '#models/cobranca'
import { CreatecobrancaDTO, UpdatecobrancaDTO } from '#dtos/cobranca_dto'
import BaseRepository from './base_repository.js'

export default class cobrancaRepository extends BaseRepository<
  InstanceType<typeof cobranca>,
  CreatecobrancaDTO,
  UpdatecobrancaDTO
> {
  constructor() {
    super(cobranca, 'cobranca')
  }

  // cobranca -> subscricao (subscricao_id) -> empresa (cliente_id) -> company_alias
  protected scopeToTenant(query: any, companyAlias: string) {
    return query
      .join('subscricao', 'subscricao.id', 'cobranca.subscricao_id')
      .join('empresa', 'empresa.id', 'subscricao.cliente_id')
      .where('empresa.company_alias', companyAlias)
  }
}
