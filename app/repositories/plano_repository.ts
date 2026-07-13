import { DateTime } from 'luxon'
import plano from '#models/plano'
import { CreateplanoDTO, UpdateplanoDTO } from '#dtos/plano_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class planoRepository {
  baseQuery() {
    return plano.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue = null) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = plano.query().whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = plano.query()
    } else {
      query = plano.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  create(data: CreateplanoDTO) {
    return plano.create(data)
  }

  async update(id: string, data: UpdateplanoDTO) {
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
