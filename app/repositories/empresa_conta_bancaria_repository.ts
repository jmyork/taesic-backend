import { DateTime } from 'luxon'
import empresa_conta_bancaria from '#models/empresa_conta_bancaria'
import {
  Createempresa_conta_bancariaDTO,
  Updateempresa_conta_bancariaDTO,
} from '#dtos/empresa_conta_bancaria_dto'

export default class empresa_conta_bancariaRepository {
  baseQuery() {
    return empresa_conta_bancaria.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = produtos.query().whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = produtos.query()
    } else {
      query = produtos.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  create(data: Createempresa_conta_bancariaDTO) {
    return empresa_conta_bancaria.create(data)
  }

  async update(id: string, data: Updateempresa_conta_bancariaDTO) {
    const r = await this.findOrFail(id)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string) {
    const r = await this.findOrFail(id)
    if (r.deletedAt) r.deletedAt = null
    else r.deletedAt = DateTime.now()
    await r.save()
  }
}
