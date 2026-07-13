import { DateTime } from 'luxon'
import produto_fabricantes from '#models/faturacao/produto_fabricantes'
import {
  Createproduto_fabricantesDTO,
  Updateproduto_fabricantesDTO,
} from '#dtos/produto_fabricantes_dto'
import { ProdutoFabricanteQueryDTO } from '#dtos/produto_fabricantes_dto'
import Empresa from '#models/empresa'

export default class produto_fabricantesRepository {
  baseQuery() {
    return produto_fabricantes.query()
  }

  async paginate(page = 1, limit = 20, filter?: ProdutoFabricanteQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('produto_fabricantes.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('produto_fabricantes.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('produto_fabricantes.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where(
        'produto_fabricantes.created_at',
        '>=',
        new Date(filter.createdDtStart).toISOString()
      )
    } else if (filter?.createdDtEnd) {
      query = query.where(
        'produto_fabricantes.created_at',
        '<=',
        new Date(filter.createdDtEnd).toISOString()
      )
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('produto_fabricantes.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where(
        'produto_fabricantes.updated_at',
        '>=',
        new Date(filter.updatedDtStart).toISOString()
      )
    } else if (filter?.updatedDtEnd) {
      query = query.where(
        'produto_fabricantes.updated_at',
        '<=',
        new Date(filter.updatedDtEnd).toISOString()
      )
    }

    // nome filter
    if (filter?.nome) {
      query = query.where('produto_fabricantes.nome', 'like', `%${filter.nome}%`)
    }

    // descricao filter
    if (filter?.endereco) {
      query = query.where('produto_fabricantes.endereco', 'like', `%${filter.endereco}%`)
    }
    if (filter?.email) {
      query = query.where('produto_fabricantes.email', 'like', `%${filter.email}%`)
    }
    if (filter?.telefone) {
      query = query.where('produto_fabricantes.telefone', 'like', `%${filter.telefone}%`)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('empresa', 'empresa.id', 'produto_fabricantes.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query.where('produto_fabricantes.empresa_id', filter.empresa_id)
    }
    return await query
      .select('produto_fabricantes.*')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .join('empresa', 'empresa.id', 'produto_fabricantes.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produto_fabricantes.id', id)
      .select(['produto_fabricantes.*'])
      .firstOrFail()
  }

  async create(data: Createproduto_fabricantesDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const { empresa_id, company_alias, ...marcaData } = data
    return produto_fabricantes.create({ ...marcaData, empresa_id: empresa.id })
  }

  async update(id: string, data: Updateproduto_fabricantesDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    const produto_fabricante = await this.baseQuery()
      .join('empresa', 'empresa.id', 'produto_fabricantes.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produto_fabricantes.id', id)
      .select('produto_fabricantes.*')
      .firstOrFail()
    produto_fabricante.deletedAt = produto_fabricante.deletedAt ? null : DateTime.now()
    await produto_fabricante.save()
  }
}
