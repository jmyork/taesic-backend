import categorias_produtos from '#models/faturacao/categorias_produtos'
import {
  CategoriaProdutoQueryDTO,
  Createcategorias_produtosDTO,
} from '#dtos/categorias_produtos_dto'
import Empresa from '#models/empresa'

export default class categorias_produtosRepository {
  baseQuery() {
    return categorias_produtos.query()
  }

  async paginate(page = 1, limit = 20, filter?: CategoriaProdutoQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('categorias_produtos.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('categorias_produtos.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('categorias_produtos.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where(
        'categorias_produtos.created_at',
        '>=',
        new Date(filter.createdDtStart).toISOString()
      )
    } else if (filter?.createdDtEnd) {
      query = query.where(
        'categorias_produtos.created_at',
        '<=',
        new Date(filter.createdDtEnd).toISOString()
      )
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('categorias_produtos.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where(
        'categorias_produtos.updated_at',
        '>=',
        new Date(filter.updatedDtStart).toISOString()
      )
    } else if (filter?.updatedDtEnd) {
      query = query.where(
        'categorias_produtos.updated_at',
        '<=',
        new Date(filter.updatedDtEnd).toISOString()
      )
    }

    // nome filter
    if (filter?.produto_id) {
      query = query.where('categorias_produtos.produto_id', 'like', `%${filter.produto_id}%`)
    }

    // descricao filter
    if (filter?.produto_categoria_id) {
      query = query.where(
        'categorias_produtos.produto_categoria_id',
        'like',
        `%${filter.produto_categoria_id}%`
      )
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('produtos', 'produtos.id', 'categorias_produtos.produto_id')
        .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query
        .leftJoin('produtos', 'produtos.id', 'categorias_produtos.produto_id')
        .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
        .where('empresa.id', filter.empresa_id)
    }

    return await query
      .select('categorias_produtos.*')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .leftJoin('produtos', 'produtos.id', 'categorias_produtos.produto_id')
      .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('categorias_produtos.id', id)
      .select(['categorias_produtos.*'])
      .firstOrFail()
  }

  async create(data: Createcategorias_produtosDTO) {
    await Empresa.findByOrFail('company_alias', data.company_alias)
    const { empresa_id, company_alias, ...marcaData } = data
    return categorias_produtos.create({ ...marcaData })
  }

  async softDelete(id: string, company_alias?: string) {
    ;(await this.findOrFail(id, company_alias)).delete()
  }
}
