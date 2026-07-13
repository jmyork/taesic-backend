import { DateTime } from 'luxon'
import papel from '#models/papel'
import { CreatepapelDTO, UpdatepapelDTO } from '#dtos/papel_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class papelRepository {
  baseQuery() {
    return papel.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = papel.query().whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = papel.query()
    } else {
      query = papel.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  create(data: CreatepapelDTO) {
    return papel.create(data)
  }

  async update(id: string, data: UpdatepapelDTO) {
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
