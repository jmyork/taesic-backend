import { DateTime } from 'luxon'
import empresa_token_activacao from '#models/empresa_token_activacao'
import {
  Createempresa_token_activacaoDTO,
  Updateempresa_token_activacaoDTO,
} from '#dtos/empresa_token_activacao_dto'

export default class empresa_token_activacaoRepository {
  baseQuery() {
    return empresa_token_activacao.query()
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

  create(data: Createempresa_token_activacaoDTO) {
    return empresa_token_activacao.create(data)
  }

  async update(id: string, data: Updateempresa_token_activacaoDTO) {
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
