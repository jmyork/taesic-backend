import { DateTime } from 'luxon'
import metodopagamento from '#models/metodopagamento'
import { CreatemetodopagamentoDTO, UpdatemetodopagamentoDTO, MetodoPagamentoQueryDTO } from '#dtos/metodopagamento_dto'

export default class metodopagamentoRepository {
  baseQuery() {
    return metodopagamento.query()
  }

  async paginate(page = 1, limit = 20, filter?: MetodoPagamentoQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('metodopagamento.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('metodopagamento.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('metodopagamento.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where(
        'metodopagamento.created_at',
        '>=',
        new Date(filter.createdDtStart).toISOString()
      )
    } else if (filter?.createdDtEnd) {
      query = query.where('metodopagamento.created_at', '<=', new Date(filter.createdDtEnd).toISOString())
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('metodopagamento.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where(
        'metodopagamento.updated_at',
        '>=',
        new Date(filter.updatedDtStart).toISOString()
      )
    } else if (filter?.updatedDtEnd) {
      query = query.where('metodopagamento.updated_at', '<=', new Date(filter.updatedDtEnd).toISOString())
    }

    // nome filter
    if (filter?.nome) {
      query = query.where('metodopagamento.nome', 'like', `%${filter.nome}%`)
    }

    // descricao filter
    if (filter?.descricao) {
      query = query.where('metodopagamento.descricao', 'like', `%${filter.descricao}%`)
    }
    return await query.select('metodopagamento.*').orderBy('created_at', 'desc').paginate(page, limit)
  }

  async findOrFail(id: string) {
    return await this.baseQuery()
      .where('metodopagamento.id', id)
      .select(['metodopagamento.*'])
      .firstOrFail()
  }

  async create(data: CreatemetodopagamentoDTO) {
    return await metodopagamento.create({
      ...data,
    })
  }

  async update(id: string, data: UpdatemetodopagamentoDTO) {
    const produto = await this.findOrFail(id)
    produto.merge(data)
    await produto.save()
    return produto
  }

  async softDelete(id: string) {
    const metodopagamento = await this.findOrFail(id)
    metodopagamento.deletedAt = metodopagamento.deletedAt ? null : DateTime.now()
    await metodopagamento.save()
  }
}
