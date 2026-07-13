import produto_descricao from '#models/faturacao/produto_descricao'
import {
  Createproduto_descricaoDTO,
  Updateproduto_descricaoDTO,
  ProdutoDescricaoQueryDTO,
} from '#dtos/produto_descricao_dto'
import Empresa from '#models/empresa'

export default class produto_descricaoRepository {
  baseQuery() {
    return produto_descricao.query()
  }

  async paginate(page = 1, limit = 20, filter?: ProdutoDescricaoQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('produto_descricao.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('produto_descricao.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('produto_descricao.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where(
        'produto_descricao.created_at',
        '>=',
        new Date(filter.createdDtStart).toISOString()
      )
    } else if (filter?.createdDtEnd) {
      query = query.where(
        'produto_descricao.created_at',
        '<=',
        new Date(filter.createdDtEnd).toISOString()
      )
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('produto_descricao.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where(
        'produto_descricao.updated_at',
        '>=',
        new Date(filter.updatedDtStart).toISOString()
      )
    } else if (filter?.updatedDtEnd) {
      query = query.where(
        'produto_descricao.updated_at',
        '<=',
        new Date(filter.updatedDtEnd).toISOString()
      )
    }

    // nome filter
    if (filter?.propriedade) {
      query = query.where('produto_descricao.propriedade', 'like', `%${filter.propriedade}%`)
    }

    // descricao filter
    if (filter?.descricao_detalhada) {
      query = query.where(
        'produto_descricao.descricao_detalhada',
        'like',
        `%${filter.descricao_detalhada}%`
      )
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('produtos', 'produtos.id', 'produto_descricao.produto_id')
        .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query
        .leftJoin('produtos', 'produtos.id', 'produto_descricao.produto_id')
        .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
        .where('empresa.id', filter.empresa_id)
    }

    return await query
      .select('produto_descricao.*')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .leftJoin('produtos', 'produtos.id', 'produto_descricao.produto_id')
      .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produto_descricao.id', id)
      .select(['produto_descricao.*'])
      .firstOrFail()
  }

  async create(data: Createproduto_descricaoDTO) {
    await Empresa.findByOrFail('company_alias', data.company_alias)
    const { empresa_id, company_alias, ...marcaData } = data
    return produto_descricao.create({ ...marcaData })
  }

  async update(id: string, data: Updateproduto_descricaoDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    ;(await this.findOrFail(id, company_alias)).delete()
  }
}
