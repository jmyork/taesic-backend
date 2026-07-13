import { DateTime } from 'luxon'
import marca from '#models/faturacao/marca'
import { CreatemarcaDTO, MarcaQueryDTO, UpdatemarcaDTO } from '#dtos/marca_dto'
import Empresa from '#models/empresa'

export default class marcaRepository {
  baseQuery() {
    return marca.query()
  }

  async paginate(page = 1, limit = 20, filter?: MarcaQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('marcas.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('marcas.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('marcas.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where('marcas.created_at', '>=', new Date(filter.createdDtStart).toISOString())
    } else if (filter?.createdDtEnd) {
      query = query.where('marcas.created_at', '<=', new Date(filter.createdDtEnd).toISOString())
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('marcas.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where('marcas.updated_at', '>=', new Date(filter.updatedDtStart).toISOString())
    } else if (filter?.updatedDtEnd) {
      query = query.where('marcas.updated_at', '<=', new Date(filter.updatedDtEnd).toISOString())
    }

    // nome filter
    if (filter?.nome) {
      query = query.where('marcas.nome', 'like', `%${filter.nome}%`)
    }

    // descricao filter
    if (filter?.descricao) {
      query = query.where('marcas.descricao', 'like', `%${filter.descricao}%`)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('empresa', 'empresa.id', 'marcas.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query.where('marcas.empresa_id', filter.empresa_id)
    }

    return await query.select('marcas.*').orderBy('created_at', 'desc').paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .join('empresa', 'empresa.id', 'marcas.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('marcas.id', id)
      .select(['marcas.*'])
      .firstOrFail()
  }

  async create(data: CreatemarcaDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const { empresa_id, company_alias, ...marcaData } = data
    return marca.create({ ...marcaData, empresa_id: empresa.id })
  }

  async update(id: string, data: UpdatemarcaDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    const marca = await this.baseQuery()
      .join('empresa', 'empresa.id', 'marcas.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('marcas.id', id)
      .select('marcas.*')
      .firstOrFail()
    marca.deletedAt = marca.deletedAt ? null : DateTime.now()
    await marca.save()
  }
}
