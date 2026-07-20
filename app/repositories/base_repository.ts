import { DateTime } from 'luxon'
import { DeletedValue } from '../helpers/Types.js'

/**
 * Repository base partilhada pelos recursos CRUD simples: pagina, encontra por id, cria,
 * actualiza e faz soft-delete/restore. Antes desta classe, ~45 repositórios duplicavam
 * exactamente esta lógica (ver auditoria em CLAUDE.md).
 *
 * `scopeToTenant` é o único método a sobrescrever quando o recurso precisa de isolamento
 * por `company_alias` — cada recurso resolve o seu próprio caminho de join (coluna
 * directa, FK a empresa, ou uma cadeia de várias tabelas); a paginação/soft-delete ficam
 * iguais para todos. Recursos sem isolamento por tenant (nível de plataforma) simplesmente
 * não sobrescrevem este método.
 */
export default abstract class BaseRepository<
  Model extends { deletedAt: DateTime | null },
  CreateDTO = Partial<Model>,
  UpdateDTO = Partial<Model>,
> {
  constructor(
    protected readonly model: any,
    protected readonly table: string
  ) {}

  baseQuery() {
    return this.model.query()
  }

  /** Sobrescrever para acrescentar joins/where que isolem o recurso por `company_alias`. */
  protected scopeToTenant(query: any, _companyAlias: string) {
    return query
  }

  paginate(page = 1, limit = 20, deleted: DeletedValue = null, companyAlias?: string) {
    let query = this.baseQuery()
    if (deleted === 'deleted') {
      query = query.whereNotNull(`${this.table}.deleted_at`)
    } else if (deleted === 'all') {
      // sem filtro: mostra apagados e não apagados
    } else {
      query = query.whereNull(`${this.table}.deleted_at`)
    }
    if (companyAlias) {
      query = this.scopeToTenant(query, companyAlias)
    }
    return query.select(`${this.table}.*`).paginate(page, limit)
  }

  findOrFail(id: string, companyAlias?: string): Promise<Model> {
    let query = this.baseQuery().where(`${this.table}.id`, id)
    if (companyAlias) {
      query = this.scopeToTenant(query, companyAlias)
    }
    return query.select(`${this.table}.*`).firstOrFail()
  }

  create(data: CreateDTO): Promise<Model> {
    return this.model.create(data)
  }

  async update(id: string, data: UpdateDTO, companyAlias?: string): Promise<Model> {
    const r: any = await this.findOrFail(id, companyAlias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, companyAlias?: string): Promise<void> {
    const r: any = await this.findOrFail(id, companyAlias)
    if (r.deletedAt) r.deletedAt = null
    else r.deletedAt = DateTime.now()
    await r.save()
  }
}
