import { DateTime } from 'luxon'
import pos from '#models/faturacao/pos'
import { CreateposDTO, PosQueryDTO, UpdateposDTO } from '#dtos/pos_dto'
import Empresa from '#models/empresa'

export default class posRepository {
  baseQuery() {
    return pos.query()
  }

  async paginate(page = 1, limit = 20, filter?: PosQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('pos.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('pos.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('pos.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where('pos.created_at', '>=', new Date(filter.createdDtStart).toISOString())
    } else if (filter?.createdDtEnd) {
      query = query.where('pos.created_at', '<=', new Date(filter.createdDtEnd).toISOString())
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('pos.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where('pos.updated_at', '>=', new Date(filter.updatedDtStart).toISOString())
    } else if (filter?.updatedDtEnd) {
      query = query.where('pos.updated_at', '<=', new Date(filter.updatedDtEnd).toISOString())
    }

    // nome filter
    if (filter?.nome) {
      query = query.where('pos.nome', 'like', `%${filter.nome}%`)
    }

    // descricao filter
    if (filter?.localizacao) {
      query = query.where('pos.localizacao', 'like', `%${filter.localizacao}%`)
    }
    if (filter?.contacto) {
      query = query.where('pos.contacto', 'like', `%${filter.contacto}%`)
    }
    if (filter?.email) {
      query = query.where('pos.email', 'like', `%${filter.email}%`)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('empresa', 'empresa.id', 'pos.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query.where('pos.empresa_id', filter.empresa_id)
    }

    return await query.select('pos.*').orderBy('created_at', 'desc').paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('pos.id', id)
      .select(['pos.*'])
      .firstOrFail()
  }

  async create(data: CreateposDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const { empresa_id, company_alias, ...marcaData } = data
    return pos.create({ ...marcaData, empresa_id: empresa.id })
  }

  async update(id: string, data: UpdateposDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    const marca = await this.baseQuery()
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('pos.id', id)
      .select('pos.*')
      .firstOrFail()
    marca.deletedAt = marca.deletedAt ? null : DateTime.now()
    await marca.save()
  }
}
