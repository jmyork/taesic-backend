import { DateTime } from 'luxon'
import project_permission_role from '#models/project_permission_role'
import {
  Createproject_permission_roleDTO,
  Updateproject_permission_roleDTO,
} from '#dtos/project_permission_role_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class project_permission_roleRepository {
  baseQuery() {
    return project_permission_role.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = project_permission_role.query().whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = project_permission_role.query()
    } else {
      query = project_permission_role.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  create(data: Createproject_permission_roleDTO) {
    return project_permission_role.create(data)
  }

  async update(id: string, data: Updateproject_permission_roleDTO) {
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
