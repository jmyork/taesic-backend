import { DateTime } from 'luxon'
import cliente from '#models/cliente'
import Empresa from '#models/empresa'
import { CreateclienteDTO, UpdateclienteDTO } from '#dtos/cliente_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class clienteRepository {
  baseQuery() {
    return cliente.query()
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue = null, company_alias?: string) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = query.whereNotNull('cliente.deleted_at')
    } else if (deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('cliente.deleted_at')
    }
    if (company_alias) {
      query = query
        .join('empresa', 'empresa.id', 'cliente.empresa_id')
        .where('empresa.company_alias', company_alias)
    }
    return query.select('cliente.*').paginate(page, limit)
  }

  findOrFail(id: string, company_alias?: string) {
    let query = this.baseQuery().where('cliente.id', id)
    if (company_alias) {
      query = query
        .join('empresa', 'empresa.id', 'cliente.empresa_id')
        .where('empresa.company_alias', company_alias)
    }
    return query.select('cliente.*').firstOrFail()
  }

  async create(data: CreateclienteDTO & { company_alias?: string }) {
    const { company_alias, ...clienteData } = data
    if (company_alias) {
      const empresa = await Empresa.findByOrFail('company_alias', company_alias)
      return cliente.create({ ...clienteData, empresa_id: empresa.id })
    }
    return cliente.create(clienteData)
  }

  async update(id: string, data: UpdateclienteDTO, company_alias?: string) {
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
