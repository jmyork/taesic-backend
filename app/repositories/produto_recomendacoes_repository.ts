import produto_recomendacoes from '#models/faturacao/produto_recomendacoes'
import {
  Createproduto_recomendacoesDTO,
  ProdutoRecomendacaoQueryDTO,
  Updateproduto_recomendacoesDTO,
} from '#dtos/produto_recomendacoes_dto'
import Empresa from '#models/empresa'

export default class produto_recomendacoesRepository {
  baseQuery() {
    return produto_recomendacoes.query()
  }

  async paginate(page = 1, limit = 20, filter?: ProdutoRecomendacaoQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('produto_recomendacoes.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('produto_recomendacoes.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('produto_recomendacoes.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where(
        'produto_recomendacoes.created_at',
        '>=',
        new Date(filter.createdDtStart).toISOString()
      )
    } else if (filter?.createdDtEnd) {
      query = query.where(
        'produto_recomendacoes.created_at',
        '<=',
        new Date(filter.createdDtEnd).toISOString()
      )
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('produto_recomendacoes.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where(
        'produto_recomendacoes.updated_at',
        '>=',
        new Date(filter.updatedDtStart).toISOString()
      )
    } else if (filter?.updatedDtEnd) {
      query = query.where(
        'produto_recomendacoes.updated_at',
        '<=',
        new Date(filter.updatedDtEnd).toISOString()
      )
    }

    // nome filter
    if (filter?.produto_id) {
      query = query.where('produto_recomendacoes.produto_id', 'like', `%${filter.produto_id}%`)
    }

    // descricao filter
    if (filter?.recomendacao) {
      query = query.where('produto_recomendacoes.recomendacao', 'like', `%${filter.recomendacao}%`)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('produtos', 'produtos.id', 'produto_recomendacoes.produto_id')
        .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query
        .leftJoin('produtos', 'produtos.id', 'produto_recomendacoes.produto_id')
        .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
        .where('empresa.id', filter.empresa_id)
    }

    return await query
      .select('produto_recomendacoes.*')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .leftJoin('produtos', 'produtos.id', 'produto_recomendacoes.produto_id')
      .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produto_recomendacoes.id', id)
      .select(['produto_recomendacoes.*'])
      .firstOrFail()
  }

  async create(data: Createproduto_recomendacoesDTO) {
    await Empresa.findByOrFail('company_alias', data.company_alias)
    const { empresa_id, company_alias, ...marcaData } = data
    return produto_recomendacoes.create({ ...marcaData })
  }

  async update(id: string, data: Updateproduto_recomendacoesDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    ;(await this.findOrFail(id, company_alias)).delete()
  }
}
