import { DateTime } from 'luxon'
import produto_fornecedores from '#models/produto_fornecedores'
import {
  Createproduto_fornecedoresDTO,
  ProdutoFornecedorQueryDTO,
  Updateproduto_fornecedoresDTO,
} from '#dtos/produto_fornecedores_dto'
import Empresa from '#models/empresa'

export default class produto_fornecedoresRepository {
  baseQuery() {
    return produto_fornecedores.query()
  }

  async paginate(page = 1, limit = 20, filter?: ProdutoFornecedorQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('produto_fornecedores.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('produto_fornecedores.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('produto_fornecedores.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where(
        'produto_fornecedores.created_at',
        '>=',
        new Date(filter.createdDtStart).toISOString()
      )
    } else if (filter?.createdDtEnd) {
      query = query.where(
        'produto_fornecedores.created_at',
        '<=',
        new Date(filter.createdDtEnd).toISOString()
      )
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('produto_fornecedores.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where(
        'produto_fornecedores.updated_at',
        '>=',
        new Date(filter.updatedDtStart).toISOString()
      )
    } else if (filter?.updatedDtEnd) {
      query = query.where(
        'produto_fornecedores.updated_at',
        '<=',
        new Date(filter.updatedDtEnd).toISOString()
      )
    }

    // nome filter
    if (filter?.nome) {
      query = query.where('produto_fornecedores.nome', 'like', `%${filter.nome}%`)
    }

    // descricao filter
    if (filter?.endereco) {
      query = query.where('produto_fornecedores.endereco', 'like', `%${filter.endereco}%`)
    }
    if (filter?.email) {
      query = query.where('produto_fornecedores.email', 'like', `%${filter.email}%`)
    }
    if (filter?.telefone) {
      query = query.where('produto_fornecedores.telefone', 'like', `%${filter.telefone}%`)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('empresa', 'empresa.id', 'produto_fornecedores.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query.where('produto_fornecedores.empresa_id', filter.empresa_id)
    }
    return await query
      .select('produto_fornecedores.*')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .join('empresa', 'empresa.id', 'produto_fornecedores.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produto_fornecedores.id', id)
      .select(['produto_fornecedores.*'])
      .firstOrFail()
  }

  async create(data: Createproduto_fornecedoresDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const { empresa_id, company_alias, ...marcaData } = data
    return produto_fornecedores.create({ ...marcaData, empresa_id: empresa.id })
  }

  async update(id: string, data: Updateproduto_fornecedoresDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    const produto_fabricante = await this.baseQuery()
      .join('empresa', 'empresa.id', 'produto_fornecedores.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('produto_fornecedores.id', id)
      .select('produto_fornecedores.*')
      .firstOrFail()
    produto_fabricante.deletedAt = produto_fabricante.deletedAt ? null : DateTime.now()
    await produto_fabricante.save()
  }
}
