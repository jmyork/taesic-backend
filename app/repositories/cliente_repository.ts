import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import cliente from '#models/cliente'
import Empresa from '#models/empresa'
import { ClienteQueryDTO, CreateclienteDTO, UpdateclienteDTO } from '#dtos/cliente_dto'
import { applyCommonFilters, FieldSpec } from '../helpers/query_filters.js'
import { proximoNumeroPorEmpresa } from '../helpers/sequencial_numero.js'

const CLIENTE_FILTER_FIELDS: FieldSpec[] = [
  { kind: 'exact', column: 'cliente.numero', key: 'numero' },
  { kind: 'like', column: 'cliente.nome', key: 'nome' },
  { kind: 'like', column: 'cliente.nome_fantasia', key: 'nome_fantasia' },
  { kind: 'like', column: 'cliente.razao_social', key: 'razao_social' },
  { kind: 'like', column: 'cliente.email', key: 'email' },
  { kind: 'like', column: 'cliente.telefone', key: 'telefone' },
  { kind: 'like', column: 'cliente.telefone_secundario', key: 'telefone_secundario' },
  { kind: 'like', column: 'cliente.nif', key: 'nif' },
  { kind: 'like', column: 'cliente.numero_registro', key: 'numero_registro' },
  { kind: 'like', column: 'cliente.cidade', key: 'cidade' },
  { kind: 'like', column: 'cliente.provincia', key: 'provincia' },
  { kind: 'like', column: 'cliente.pais', key: 'pais' },
  { kind: 'exact', column: 'cliente.tipo', key: 'tipo' },
  { kind: 'exact', column: 'cliente.ativo', key: 'ativo' },
  { kind: 'exact', column: 'cliente.cliente_pai_id', key: 'cliente_pai_id' },
]

/** Campos varridos pela pesquisa livre (`q`) — os mesmos "detalhes do cliente" pesquisáveis
 * individualmente acima, só que todos ao mesmo tempo com OR (para uma caixa de pesquisa
 * única no frontend, em vez de vários filtros separados). */
const CLIENTE_Q_COLUMNS = [
  'cliente.nome',
  'cliente.nome_fantasia',
  'cliente.razao_social',
  'cliente.email',
  'cliente.telefone',
  'cliente.telefone_secundario',
  'cliente.nif',
]

export default class clienteRepository {
  baseQuery() {
    return cliente.query()
  }

  protected scopeToTenant(query: any, companyAlias: string) {
    return query
      .join('empresa', 'empresa.id', 'cliente.empresa_id')
      .where('empresa.company_alias', companyAlias)
  }

  paginate(page = 1, limit = 20, filter?: ClienteQueryDTO) {
    let query = applyCommonFilters(this.baseQuery(), filter, {
      table: 'cliente',
      fields: CLIENTE_FILTER_FIELDS,
    })

    if (filter?.q) {
      query = query.where((sub: any) => {
        for (const column of CLIENTE_Q_COLUMNS) {
          sub.orWhere(column, 'like', `%${filter.q}%`)
        }
      })
    }

    if (filter?.company_alias) {
      query = this.scopeToTenant(query, filter.company_alias)
    } else if (filter?.empresa_id) {
      query = query.where('cliente.empresa_id', filter.empresa_id)
    }

    return query.select('cliente.*').orderBy('cliente.created_at', 'desc').paginate(page, limit)
  }

  findOrFail(id: string, companyAlias?: string) {
    let query = this.baseQuery().where('cliente.id', id)
    if (companyAlias) {
      query = this.scopeToTenant(query, companyAlias)
    }
    return query.select('cliente.*').firstOrFail()
  }

  async create(data: CreateclienteDTO & { company_alias?: string }) {
    const { company_alias, ...clienteData } = data
    if (company_alias) {
      const empresa = await Empresa.findByOrFail('company_alias', company_alias)
      return db.transaction(async (trx) => {
        const numero = await proximoNumeroPorEmpresa(trx, empresa.id, cliente)
        return cliente.create({ ...clienteData, empresa_id: empresa.id, numero }, { client: trx })
      })
    }
    return cliente.create(clienteData)
  }

  async update(id: string, data: UpdateclienteDTO, companyAlias?: string) {
    const r = await this.findOrFail(id, companyAlias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, companyAlias?: string) {
    const r = await this.findOrFail(id, companyAlias)
    if (r.deletedAt) r.deletedAt = null
    else r.deletedAt = DateTime.now()
    await r.save()
  }
}
