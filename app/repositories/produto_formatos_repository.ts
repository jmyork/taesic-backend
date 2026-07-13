import { DateTime } from 'luxon'
import produto_formatos from '#models/faturacao/produto_formatos'
import {
  Createproduto_formatosDTO,
  ProdutoFormatoQueryDTO,
  Updateproduto_formatosDTO,
} from '#dtos/produto_formatos_dto'
import Empresa from '#models/empresa'

export default class produto_formatosRepository {
  baseQuery() {
    return produto_formatos.query()
  }

  async paginate(page = 1, limit = 20, filter?: ProdutoFormatoQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('produto_formatos.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('produto_formatos.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('produto_formatos.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where(
        'produto_formatos.created_at',
        '>=',
        new Date(filter.createdDtStart).toISOString()
      )
    } else if (filter?.createdDtEnd) {
      query = query.where(
        'produto_formatos.created_at',
        '<=',
        new Date(filter.createdDtEnd).toISOString()
      )
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('produto_formatos.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where(
        'produto_formatos.updated_at',
        '>=',
        new Date(filter.updatedDtStart).toISOString()
      )
    } else if (filter?.updatedDtEnd) {
      query = query.where(
        'produto_formatos.updated_at',
        '<=',
        new Date(filter.updatedDtEnd).toISOString()
      )
    }

    // nome filter
    if (filter?.nome) {
      query = query.where('produto_formatos.nome', 'like', `%${filter.nome}%`)
    }

    // descricao filter
    if (filter?.descricao) {
      query = query.where('produto_formatos.descricao', 'like', `%${filter.descricao}%`)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('empresa', 'empresa.id', 'produto_formatos.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query.where('produto_formatos.empresa_id', filter.empresa_id)
    }

    return await query
      .select('produto_formatos.*')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    // //console.log(reaching query)
    return await this.baseQuery()
      .join('empresa', 'empresa.id', 'produto_formatos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produto_formatos.id', id)
      .select(['produto_formatos.*'])
      .firstOrFail()
  }

  async create(data: Createproduto_formatosDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const { empresa_id, company_alias, ...formatoData } = data
    return produto_formatos.create({
      ...formatoData,
      empresa_id: empresa.id,
    })
  }

  async update(id: string, data: Updateproduto_formatosDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    const produto_formatos = await this.baseQuery()
      .join('empresa', 'empresa.id', 'produto_formatos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produto_formatos.id', id)
      .select('produto_formatos.*')
      .firstOrFail()
    produto_formatos.deletedAt = produto_formatos.deletedAt ? null : DateTime.now()
    await produto_formatos.save()
  }
}
