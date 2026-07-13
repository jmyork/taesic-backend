import { DateTime } from 'luxon'
import user_papel from '#models/user_papel'
import { Createuser_papelDTO, Updateuser_papelDTO } from '#dtos/user_papel_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class user_papelRepository {
  baseQuery() {
    return user_papel.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = user_papel.query().whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = user_papel.query()
    } else {
      query = user_papel.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  create(data: Createuser_papelDTO) {
    return user_papel.create(data)
  }

  async update(id: string, data: Updateuser_papelDTO) {
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
