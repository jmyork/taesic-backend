import { DateTime } from 'luxon'
import pessoa from '#models/pessoa'
import Empresa from '#models/empresa'
import { CreatepessoaDTO, UpdatepessoaDTO } from '#dtos/pessoa_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class pessoaRepository {
  baseQuery() {
    return pessoa.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue = null, company_alias?: string) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = query.whereNotNull('pessoa.deleted_at')
    } else if (deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('pessoa.deleted_at')
    }
    if (company_alias) {
      query = query
        .join('empresa', 'empresa.id', 'pessoa.empresa_id')
        .where('empresa.company_alias', company_alias)
    }
    return query.select('pessoa.*').paginate(page, limit)
  }

  findOrFail(id: string, company_alias?: string) {
    let query = this.baseQuery().where('pessoa.id', id)
    if (company_alias) {
      query = query
        .join('empresa', 'empresa.id', 'pessoa.empresa_id')
        .where('empresa.company_alias', company_alias)
    }
    return query.select('pessoa.*').firstOrFail()
  }

  async create(data: CreatepessoaDTO & { company_alias?: string }) {
    const { company_alias, ...pessoaData } = data
    if (company_alias) {
      const empresa = await Empresa.findByOrFail('company_alias', company_alias)
      return pessoa.create({ ...pessoaData, empresa_id: empresa.id })
    }
    return pessoa.create(pessoaData)
  }

  async update(id: string, data: UpdatepessoaDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    if (r.deletedAt) r.deletedAt = null
    else r.deletedAt = DateTime.now()
    await r.save()
  }
}
