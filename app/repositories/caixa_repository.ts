import { DateTime } from 'luxon'
import caixa from '#models/caixa'
import { CaixaQueryDTO, CloseCaixaDTO, OpenCaixaDTO, ReOpenCaixaDTO } from '#dtos/caixa_dto'
import CaixaAlreadyOpenException from '#exceptions/caixa_already_open_exception'
import UnAuthorizedCaixaException from '#exceptions/un_authorized_caixa_exception'
import { userBelongsToPOS, userHasRole } from '../helpers/Utils.js'
import { applyCommonFilters, FieldSpec } from '../helpers/query_filters.js'
import CaixaAlreadyClosedException from '#exceptions/caixa_already_closed_exception'
import CaixaIsAlreadyOpenException from '#exceptions/caixa_is_already_open_exception'
import UserIsNotAPosWorkerException from '#exceptions/user_is_not_a_pos_worker_exception'

const CAIXA_FILTER_FIELDS: FieldSpec[] = [
  { kind: 'like', column: 'caixa.observacoes', key: 'observacoes' },
  { kind: 'exact', column: 'caixa.status', key: 'status' },
  { kind: 'exact', column: 'caixa.data_fecho', key: 'data_fecho' },
  { kind: 'range', column: 'caixa.total_vendas', startKey: 'total_vendas_start', endKey: 'total_vendas_end', exactKey: 'total_vendas' },
  { kind: 'range', column: 'caixa.valor_inicial', startKey: 'valor_inicial_start', endKey: 'valor_inicial_end', exactKey: 'valor_inicial' },
  { kind: 'range', column: 'caixa.total_caixa', startKey: 'total_caixa_start', endKey: 'total_caixa_end', exactKey: 'total_caixa' },
]

export default class caixaRepository {
  baseQuery() {
    return caixa.query()
  }

  /** Filtros partilhados por `paginate` e `listByUser` — antes duplicados linha a linha nos dois métodos. */
  private applyFilters(query: any, filter?: CaixaQueryDTO) {
    return applyCommonFilters(query, filter, { table: 'caixa', fields: CAIXA_FILTER_FIELDS })
  }

  paginate(page = 1, limit = 20, filter?: CaixaQueryDTO) {
    let query = this.applyFilters(this.baseQuery(), filter)

    // user_id filter
    if (filter?.user_id) {
      query = query.where('caixa.user_id', filter.user_id)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .join('user', 'caixa.user_id', 'user.id')
        .join('empresa', 'empresa.id', 'user.empresa_id')
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id && !filter?.company_alias) {
      query = query
        .join('user', 'caixa.user_id', 'user.id')
        .where('user.empresa_id', filter.empresa_id)
        .where('caixa.empresa_id', filter.empresa_id)
    }
    return query.select('caixa.*').paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    let query = this.baseQuery().where('caixa.id', id)
    if (company_alias) {
      query = query
        .join('user', 'caixa.user_id', 'user.id')
        .join('empresa', 'empresa.id', 'user.empresa_id')
        .where('empresa.company_alias', company_alias)
    }
    return await query.select('caixa.*').firstOrFail()
  }

  async open(data: OpenCaixaDTO) {
    // verificar se o user é funcionário do POS indicado.
    const userIsPosWorker= await userBelongsToPOS(data.user_id,data.pos_id)
    if(!userIsPosWorker && !(await userHasRole(data.user_id!, ['Admin']))){
      throw new UserIsNotAPosWorkerException()
    }
    // verificar se tem um caixa aberto deste user
    const caixaAberto = await this.baseQuery()
      .join('user', 'caixa.user_id', 'user.id')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('caixa.status', 'Aberto')
      .where('empresa.company_alias', data.company_alias)
      .where('caixa.user_id', data.user_id)
      .select('caixa.*')
      .first()

    if (caixaAberto) {
      throw new CaixaAlreadyOpenException()
    }

    // checar o dia caixa aberto no dia de hoje
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const caixaHoje = await this.baseQuery()
      .join('user', 'caixa.user_id', 'user.id')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('caixa.status', 'Fechado')
      .where('empresa.company_alias', data.company_alias)
      .where('caixa.user_id', data.user_id)
      .where('caixa.created_at', '>=', hoje)
      .select('caixa.*')
      .first()

    if (caixaHoje?.status.toLocaleLowerCase() === 'fechado') {
      return this.reopen(caixaHoje.id,{...data})
    }

    //validar
    const { company_alias, ...caixaData } = data

    return await caixa.create({ ...caixaData, status: 'Aberto' })
  }

  async close(id: string, data: CloseCaixaDTO) {
    const caixa = await this.findOrFail(id, data.company_alias)

    if (
      caixa.user_id !== data.user_id &&
      !(await userHasRole(data.user_id!, ['Admin', 'Gerente', 'Supervisor']))
    ) {
      throw new UnAuthorizedCaixaException()
    }

    if (caixa.status.toLocaleLowerCase() === 'fechado') {
      throw new CaixaAlreadyClosedException()
    }
    const { company_alias, ...caixaData } = data
    caixa.merge({ ...caixaData, status: 'Fechado', data_fecho: DateTime.now() })
    await caixa.save()
    return caixa
  }

  async reopen(id: string, data: ReOpenCaixaDTO) {
    const caixa = await this.findOrFail(id, data.company_alias)
    
    if (
      caixa.user_id !== data.user_id &&
      !(await userHasRole(data.user_id!, ['Admin', 'Gerente', 'Supervisor']))
    ) {
      throw new UnAuthorizedCaixaException()
    }
    if (caixa.status.toLocaleLowerCase() === 'aberto') {
      throw new CaixaIsAlreadyOpenException()
    }

    const { company_alias, ...caixaData } = data
    caixa.merge({ ...caixaData, status: 'Aberto', data_fecho: null })
    await caixa.save()
    return caixa
  }

  async destroy(id: string, data: CloseCaixaDTO | ReOpenCaixaDTO) {

    const caixa = await this.findOrFail(id, data.company_alias)

    if (
      caixa.user_id !== data.user_id &&
      !(await userHasRole(data.user_id!, ['Admin', 'Gerente', 'Supervisor']))
    ) {
      throw new UnAuthorizedCaixaException()
    }

    const isOpen = caixa.status.toLocaleLowerCase() === 'aberto'
    // verificar se a pretenção da execução desta função é reabrir um caixa  e caso seja, faça uma verficação se já existe um caixa aberto do mesmo responsável do caixa
    if (!isOpen) {
      const caixaAberto = await this.baseQuery()
        .join('user', 'caixa.user_id', 'user.id')
        .join('empresa', 'empresa.id', 'user.empresa_id')
        .where('caixa.status', 'aberto')
        .where('empresa.company_alias', data.company_alias!)
        .where('caixa.user_id', caixa.user_id)
        .select('caixa.*')
        .first()

      if (caixaAberto) {
        throw new CaixaAlreadyOpenException()
      }
    }
    const { company_alias, user_id, ...caixaData } = data

    caixa.merge({
      ...caixaData,
      status: isOpen ? 'Fechado' : 'Aberto',
      data_fecho: isOpen ? DateTime.now() : null,
    })

    await caixa.save()
    return caixa
  }

  async listByUser(user_id: string, filter?: CaixaQueryDTO) {
    const query = this.applyFilters(this.baseQuery().where('caixa.user_id', user_id), filter)
    return query.select('caixa.*').paginate(filter?.page ?? 1, filter?.limit ?? 20)
  }
}
