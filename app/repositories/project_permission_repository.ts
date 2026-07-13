import { DateTime } from 'luxon'
import project_permission from '#models/project_permission'
import {
  Createproject_permissionDTO,
  Updateproject_permissionDTO,
} from '#dtos/project_permission_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class project_permissionRepository {
  baseQuery() {
    return project_permission.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = project_permission.query().whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = project_permission.query()
    } else {
      query = project_permission.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  create(data: Createproject_permissionDTO) {
    return project_permission.create(data)
  }

  async update(id: string, data: Updateproject_permissionDTO) {
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
