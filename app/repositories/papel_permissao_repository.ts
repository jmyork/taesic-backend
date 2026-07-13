import { DateTime } from 'luxon'
import papel_permissao from '#models/papel_permissao'
import { Createpapel_permissaoDTO, Updatepapel_permissaoDTO } from '#dtos/papel_permissao_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class papel_permissaoRepository {
  baseQuery() {
    return papel_permissao.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = papel_permissao.query().whereNotNull('deleted_at')
    } else if (deleted === 'all') {
      query = papel_permissao.query()
    } else {
      query = papel_permissao.query().whereNull('deleted_at')
    }
    return query.paginate(page, limit)
  }

  findOrFail(id: string) {
    return this.baseQuery().where('id', id).firstOrFail()
  }

  create(data: Createpapel_permissaoDTO) {
    return papel_permissao.create(data)
  }

  async update(id: string, data: Updatepapel_permissaoDTO) {
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
