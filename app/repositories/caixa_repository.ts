import { DateTime } from 'luxon'
import caixa from '#models/caixa'
import { CaixaQueryDTO, CloseCaixaDTO, OpenCaixaDTO, ReOpenCaixaDTO } from '#dtos/caixa_dto'
import CaixaAlreadyOpenException from '#exceptions/caixa_already_open_exception'
import UnAuthorizedCaixaException from '#exceptions/un_authorized_caixa_exception'
import { userHasRole } from '../helpers/Utils.js'
import CaixaAlreadyClosedException from '#exceptions/caixa_already_closed_exception'
import CaixaIsAlreadyOpenException from '#exceptions/caixa_is_already_open_exception'

export default class caixaRepository {
  baseQuery() {
    return caixa.query()
  }

  /** Filtros partilhados por `paginate` e `listByUser` — antes duplicados linha a linha nos dois métodos. */
  private applyFilters(query: any, filter?: CaixaQueryDTO) {
    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('caixa.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('caixa.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('caixa.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where('caixa.created_at', '>=', filter.createdDtStart)
    } else if (filter?.createdDtEnd) {
      query = query.where('caixa.created_at', '<=', new Date(filter.createdDtEnd).toISOString())
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('caixa.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where('caixa.updated_at', '>=', new Date(filter.updatedDtStart).toISOString())
    } else if (filter?.updatedDtEnd) {
      query = query.where('caixa.updated_at', '<=', new Date(filter.updatedDtEnd).toISOString())
    }

    // observacoes filter
    if (filter?.observacoes) {
      query = query.where('caixa.observacoes', 'like', `%${filter.observacoes}%`)
    }

    // status filter
    if (filter?.status) {
      query = query.where('caixa.status', filter.status)
    }

    // total_vendas filter
    if (filter?.total_vendas) {
      query = query.where('caixa.total_vendas', filter.total_vendas)
    }

    // valor_inicial filter
    if (filter?.valor_inicial) {
      query = query.where('caixa.valor_inicial', filter.valor_inicial)
    }

    // data_fecho filter
    if (filter?.data_fecho) {
      query = query.where('caixa.data_fecho', filter.data_fecho)
    }

    // total_caixa filter
    if (filter?.total_caixa) {
      query = query.where('caixa.total_caixa', filter.total_caixa)
    }

    // total_vendas range filter
    if (filter?.total_vendas_start && filter?.total_vendas_end) {
      query = query.whereBetween('caixa.total_vendas', [
        filter.total_vendas_start,
        filter.total_vendas_end,
      ])
    } else if (filter?.total_vendas_start) {
      query = query.where('caixa.total_vendas', '>=', filter.total_vendas_start)
    } else if (filter?.total_vendas_end) {
      query = query.where('caixa.total_vendas', '<=', filter.total_vendas_end)
    }

    // valor_inicial range filter
    if (filter?.valor_inicial_start && filter?.valor_inicial_end) {
      query = query.whereBetween('caixa.valor_inicial', [
        filter.valor_inicial_start,
        filter.valor_inicial_end,
      ])
    } else if (filter?.valor_inicial_start) {
      query = query.where('caixa.valor_inicial', '>=', filter.valor_inicial_start)
    } else if (filter?.valor_inicial_end) {
      query = query.where('caixa.valor_inicial', '<=', filter.valor_inicial_end)
    }

    // total_caixa range filter
    if (filter?.total_caixa_start && filter?.total_caixa_end) {
      query = query.whereBetween('caixa.total_caixa', [
        filter.total_caixa_start,
        filter.total_caixa_end,
      ])
    } else if (filter?.total_caixa_start) {
      query = query.where('caixa.total_caixa', '>=', filter.total_caixa_start)
    } else if (filter?.total_caixa_end) {
      query = query.where('caixa.total_caixa', '<=', filter.total_caixa_end)
    }

    return query
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
    const caixaAberto = await this.baseQuery()
      .join('user', 'caixa.user_id', 'user.id')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('caixa.status', 'aberto')
      .where('empresa.company_alias', data.company_alias)
      .where('caixa.user_id', data.user_id)
      .first()

    if (caixaAberto) {
      throw new CaixaAlreadyOpenException()
    }
    const { company_alias, ...caixaData } = data
    // `status` tem um default a nível de BD ('Aberto', capitalizado — inconsistente com o
    // 'aberto' minúsculo usado em todo o resto do código), mas o MySQL não devolve defaults
    // calculados pela BD depois de um INSERT — o objecto em memória ficava com
    // `status: undefined` até à próxima leitura. Definir aqui explicitamente evita depender
    // do default da BD (e da colação case-insensitive que escondia a inconsistência).
    return await caixa.create({ ...caixaData, status: 'aberto' })
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
    caixa.merge({ ...caixaData, status: 'fechado', data_fecho: DateTime.now() })
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
    caixa.merge({ ...caixaData, status: 'aberto', data_fecho: DateTime.now() })
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
        .first()

      if (caixaAberto) {
        throw new CaixaAlreadyOpenException()
      }
    }
    const { company_alias, user_id, ...caixaData } = data

    caixa.merge({
      ...caixaData,
      status: isOpen ? 'fechado' : 'aberto',
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
