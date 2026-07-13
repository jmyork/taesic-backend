import { DateTime } from 'luxon'
import subscricao from '#models/subscricao'
import { CreatesubscricaoDTO, UpdatesubscricaoDTO } from '#dtos/subscricao_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class subscricaoRepository {
  baseQuery() {
    return subscricao.query()
  }

  // `subscricao.cliente_id` referencia `empresa.id` (nome de coluna enganoso, mas é o FK real).
  paginate(page = 1, limit = 20, deleted: DeletedValue = null, company_alias?: string) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = query.whereNotNull('subscricao.deleted_at')
    } else if (deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('subscricao.deleted_at')
    }
    if (company_alias) {
      query = query
        .join('empresa', 'empresa.id', 'subscricao.cliente_id')
        .where('empresa.company_alias', company_alias)
    }
    return query.select('subscricao.*').paginate(page, limit)
  }

  findOrFail(id: string, company_alias?: string) {
    let query = this.baseQuery().where('subscricao.id', id)
    if (company_alias) {
      query = query
        .join('empresa', 'empresa.id', 'subscricao.cliente_id')
        .where('empresa.company_alias', company_alias)
    }
    return query.select('subscricao.*').firstOrFail()
  }

  create(data: CreatesubscricaoDTO) {
    return subscricao.create(data)
  }

  async update(id: string, data: UpdatesubscricaoDTO, company_alias?: string) {
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
