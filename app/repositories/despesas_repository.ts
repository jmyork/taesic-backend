import { DateTime } from 'luxon'
import despesas from '#models/faturacao/despesas'
import Empresa from '#models/empresa'
import { CreatedespesasDTO, UpdatedespesasDTO, DespesasQueryDTO } from '#dtos/despesas_dto'
import { applyCommonFilters, applyRange, FieldSpec } from '../helpers/query_filters.js'

const DESPESAS_FILTER_FIELDS: FieldSpec[] = [
  { kind: 'exact', column: 'despesas.pos_id', key: 'pos_id' },
  { kind: 'like', column: 'despesas.categoria', key: 'categoria' },
  { kind: 'range', column: 'despesas.valor', startKey: 'valor_start', endKey: 'valor_end', exactKey: 'valor' },
]

export default class despesasRepository {
  baseQuery() {
    return despesas.query()
  }

  async paginate(page = 1, limit = 20, filter?: DespesasQueryDTO) {
    let query = applyCommonFilters(this.baseQuery(), filter, {
      table: 'despesas',
      fields: DESPESAS_FILTER_FIELDS,
    })

    applyRange(query, 'despesas.data_despesa', filter?.data_despesa_start, filter?.data_despesa_end)

    if (filter?.company_alias) {
      query = query
        .join('empresa', 'empresa.id', 'despesas.empresa_id')
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id && !filter?.company_alias) {
      query = query.where('despesas.empresa_id', filter.empresa_id)
    }

    return await query.select('despesas.*').orderBy('despesas.data_despesa', 'desc').paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    let query = this.baseQuery().where('despesas.id', id)
    if (company_alias) {
      query = query
        .join('empresa', 'empresa.id', 'despesas.empresa_id')
        .where('empresa.company_alias', company_alias)
    }
    return await query.select(['despesas.*']).firstOrFail()
  }

  async create(data: CreatedespesasDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const { company_alias, empresa_id, ...despesaData } = data
    return await despesas.create({ ...despesaData, empresa_id: empresa.id })
  }

  async update(id: string, data: UpdatedespesasDTO, company_alias?: string) {
    const despesa = await this.findOrFail(id, company_alias)
    despesa.merge(data)
    await despesa.save()
    return despesa
  }

  async softDelete(id: string, company_alias?: string) {
    const despesa = await this.findOrFail(id, company_alias)
    despesa.deletedAt = despesa.deletedAt ? null : DateTime.now()
    await despesa.save()
  }
}
