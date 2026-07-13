import { DateTime } from 'luxon'
import project_user from '#models/project_user'
import { Createproject_userDTO, Updateproject_userDTO } from '#dtos/project_user_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class project_userRepository {
  baseQuery() {
    return project_user.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = project_user.query().whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = project_user.query()
    } else {
      query = project_user.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  create(data: Createproject_userDTO) {
    return project_user.create(data)
  }

  async update(id: string, data: Updateproject_userDTO) {
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
