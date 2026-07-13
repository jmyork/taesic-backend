import { DateTime } from 'luxon'
import userpos from '#models/userpos'
import { CreateuserposDTO, UserPosQueryDTO } from '#dtos/userpos_dto'
import Empresa from '#models/empresa'

export default class userposRepository {
  baseQuery() {
    return userpos.query()
  }

  async paginate(page = 1, limit = 20, filter?: UserPosQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('userpos.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('userpos.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('userpos.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where('userpos.created_at', '>=', new Date(filter.createdDtStart).toISOString())
    } else if (filter?.createdDtEnd) {
      query = query.where('userpos.created_at', '<=', new Date(filter.createdDtEnd).toISOString())
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('userpos.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where('userpos.updated_at', '>=', new Date(filter.updatedDtStart).toISOString())
    } else if (filter?.updatedDtEnd) {
      query = query.where('userpos.updated_at', '<=', new Date(filter.updatedDtEnd).toISOString())
    }

    // user_id filter
    if (filter?.user_id) {
      query = query.where('userpos.user_id', filter.user_id)
    }

    // pos_id filter
    if (filter?.pos_id) {
      query = query.where('userpos.pos_id', filter.pos_id)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .join('pos', 'pos.id', 'userpos.pos_id')
        .leftJoin('empresa', 'empresa.id', 'pos.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id && !filter?.company_alias) {
      query = query
        .join('pos', 'pos.id', 'userpos.pos_id')
        .where('pos.empresa_id', filter.empresa_id)
        .where('userpos.empresa_id', filter.empresa_id)
    }

    return await query.select('userpos.*').orderBy('created_at', 'desc').paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .join('pos', 'pos.id', 'userpos.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('userpos.id', id)
      .select(['userpos.*'])
      .firstOrFail()
  }

  async create(data: CreateuserposDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const { empresa_id, company_alias, ...userposData } = data
    return userpos.create({ ...userposData })
  }

  async softDelete(id: string, company_alias?: string) {
    const userpos = await this.baseQuery()
      .join('pos', 'pos.id', 'userpos.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('userpos.id', id)
      .select('userpos.*')
      .firstOrFail()
    userpos.deletedAt = userpos.deletedAt ? null : DateTime.now()
    await userpos.save()
  }
}
