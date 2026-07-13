import { DateTime } from 'luxon'
import project from '#models/authplatform/project'
import { CreateprojectDTO, UpdateprojectDTO } from '#dtos/project_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class projectRepository {
  baseQuery() {
    return project.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = project.query().whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = project.query()
    } else {
      query = project.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  create(data: CreateprojectDTO) {
    return project.create(data)
  }

  async update(id: string, data: UpdateprojectDTO) {
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
