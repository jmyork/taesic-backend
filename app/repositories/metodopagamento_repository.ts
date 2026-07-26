import { DateTime } from 'luxon'
import metodopagamento from '#models/metodopagamento'
import Empresa from '#models/empresa'
import { CreatemetodopagamentoDTO, UpdatemetodopagamentoDTO, MetodoPagamentoQueryDTO } from '#dtos/metodopagamento_dto'
import { applyCommonFilters, FieldSpec } from '../helpers/query_filters.js'

const METODOPAGAMENTO_FILTER_FIELDS: FieldSpec[] = [
  { kind: 'like', column: 'metodopagamento.nome', key: 'nome' },
  { kind: 'like', column: 'metodopagamento.descricao', key: 'descricao' },
]

export default class metodopagamentoRepository {
  baseQuery() {
    return metodopagamento.query()
  }

  async paginate(page = 1, limit = 20, filter?: MetodoPagamentoQueryDTO) {
    let query = applyCommonFilters(this.baseQuery(), filter, {
      table: 'metodopagamento',
      fields: METODOPAGAMENTO_FILTER_FIELDS,
    })

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .join('empresa', 'empresa.id', 'metodopagamento.empresa_id')
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id && !filter?.company_alias) {
      query = query.where('metodopagamento.empresa_id', filter.empresa_id)
    }

    return await query.select('metodopagamento.*').orderBy('metodopagamento.created_at', 'desc').paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    let query = this.baseQuery().where('metodopagamento.id', id)
    if (company_alias) {
      query = query
        .join('empresa', 'empresa.id', 'metodopagamento.empresa_id')
        .where('empresa.company_alias', company_alias)
    }
    return await query.select(['metodopagamento.*']).firstOrFail()
  }

  async create(data: CreatemetodopagamentoDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const { company_alias, empresa_id, ...metodoData } = data
    return await metodopagamento.create({ ...metodoData, empresa_id: empresa.id })
  }

  async update(id: string, data: UpdatemetodopagamentoDTO, company_alias?: string) {
    const metodo = await this.findOrFail(id, company_alias)
    metodo.merge(data)
    await metodo.save()
    return metodo
  }

  async softDelete(id: string, company_alias?: string) {
    const metodo = await this.findOrFail(id, company_alias)
    metodo.deletedAt = metodo.deletedAt ? null : DateTime.now()
    await metodo.save()
  }
}
