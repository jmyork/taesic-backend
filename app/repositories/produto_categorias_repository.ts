import { DateTime } from 'luxon'
import produto_categorias from '#models/faturacao/produto_categorias'
import {
  Createproduto_categoriasDTO,
  ProdutoCategoriaQueryDTO,
  Updateproduto_categoriasDTO,
} from '#dtos/produto_categorias_dto'
import Empresa from '#models/empresa'

export default class produto_categoriasRepository {
  baseQuery() {
    return produto_categorias.query()
  }

  async paginate(page = 1, limit = 20, filter?: ProdutoCategoriaQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('produto_categorias.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('produto_categorias.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('produto_categorias.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where(
        'produto_categorias.created_at',
        '>=',
        new Date(filter.createdDtStart).toISOString()
      )
    } else if (filter?.createdDtEnd) {
      query = query.where(
        'produto_categorias.created_at',
        '<=',
        new Date(filter.createdDtEnd).toISOString()
      )
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('produto_categorias.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where(
        'produto_categorias.updated_at',
        '>=',
        new Date(filter.updatedDtStart).toISOString()
      )
    } else if (filter?.updatedDtEnd) {
      query = query.where(
        'produto_categorias.updated_at',
        '<=',
        new Date(filter.updatedDtEnd).toISOString()
      )
    }

    // nome filter
    if (filter?.nome) {
      query = query.where('produto_categorias.nome', 'like', `%${filter.nome}%`)
    }

    // descricao filter
    if (filter?.descricao) {
      query = query.where('produto_categorias.descricao', 'like', `%${filter.descricao}%`)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('empresa', 'empresa.id', 'produto_categorias.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query.where('produto_categorias.empresa_id', filter.empresa_id)
    }

    return await query
      .select('produto_categorias.*')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .join('empresa', 'empresa.id', 'produto_categorias.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produto_categorias.id', id)
      .select(['produto_categorias.*'])
      .firstOrFail()
  }

  async create(data: Createproduto_categoriasDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const { empresa_id, company_alias, ...marcaData } = data
    return produto_categorias.create({ ...marcaData, empresa_id: empresa.id })
  }

  async update(id: string, data: Updateproduto_categoriasDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    const produto_categoria = await this.baseQuery()
      .join('empresa', 'empresa.id', 'produto_categorias.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produto_categorias.id', id)
      .select('produto_categorias.*')
      .firstOrFail()
    produto_categoria.deletedAt = produto_categoria.deletedAt ? null : DateTime.now()
    await produto_categoria.save()
  }
}
