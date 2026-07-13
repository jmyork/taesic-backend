import { DateTime } from 'luxon'
import cobranca from '#models/cobranca'
import { CreatecobrancaDTO, UpdatecobrancaDTO } from '#dtos/cobranca_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class cobrancaRepository {
  baseQuery() {
    return cobranca.query()
  }

  // cobranca -> subscricao (subscricao_id) -> empresa (cliente_id) -> company_alias
  paginate(page = 1, limit = 20, deleted: DeletedValue = null, company_alias?: string) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = query.whereNotNull('cobranca.deleted_at')
    } else if (deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('cobranca.deleted_at')
    }
    if (company_alias) {
      query = query
        .join('subscricao', 'subscricao.id', 'cobranca.subscricao_id')
        .join('empresa', 'empresa.id', 'subscricao.cliente_id')
        .where('empresa.company_alias', company_alias)
    }
    return query.select('cobranca.*').paginate(page, limit)
  }

  findOrFail(id: string, company_alias?: string) {
    let query = this.baseQuery().where('cobranca.id', id)
    if (company_alias) {
      query = query
        .join('subscricao', 'subscricao.id', 'cobranca.subscricao_id')
        .join('empresa', 'empresa.id', 'subscricao.cliente_id')
        .where('empresa.company_alias', company_alias)
    }
    return query.select('cobranca.*').firstOrFail()
  }

  create(data: CreatecobrancaDTO) {
    return cobranca.create(data)
  }

  async update(id: string, data: UpdatecobrancaDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    if (r.deletedAt) r.deletedAt = null
    else r.deletedAt = DateTime.now()
    await r.save()
  }
}
