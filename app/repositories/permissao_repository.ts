import { DateTime } from 'luxon'
import permissao from '#models/permissao'
import { CreatepermissaoDTO, UpdatepermissaoDTO } from '#dtos/permissao_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class permissaoRepository {
  baseQuery() {
    return permissao.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = permissao.query().whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = permissao.query()
    } else {
      query = permissao.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  create(data: CreatepermissaoDTO) {
    return permissao.create(data)
  }

  async update(id: string, data: UpdatepermissaoDTO) {
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
