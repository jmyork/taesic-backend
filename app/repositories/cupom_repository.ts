import { DateTime } from 'luxon'
import { randomBytes } from 'node:crypto'
import cupom from '#models/cupom'
import Empresa from '#models/empresa'
import Promotor from '#models/promotor'
import PromotorEmpresaMismatchException from '#exceptions/promotor_empresa_mismatch_exception'
import { CreatecupomDTO, CupomQueryDTO, UpdatecupomDTO } from '#dtos/cupom_dto'

export default class cupomRepository {
  baseQuery() {
    return cupom.query()
  }

  /** Gera um código curto, legível e único (ex: PROMO-7F2A9C) — tenta algumas vezes para evitar colisões. */
  private async gerarCodigoUnico(): Promise<string> {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const sufixo = randomBytes(4).toString('hex').toUpperCase()
      const codigo = `PROMO-${sufixo}`
      const existe = await cupom.query().where('codigo', codigo).first()
      if (!existe) return codigo
    }
    throw new Error('Não foi possível gerar um código de cupão único — tente novamente.')
  }

  async paginate(page = 1, limit = 20, filter?: CupomQueryDTO) {
    let query = this.baseQuery()

    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('cupom.deleted_at')
    } else if (filter?.deleted !== 'all') {
      query = query.whereNull('cupom.deleted_at')
    }

    if (filter?.promotor_id) {
      query = query.where('cupom.promotor_id', filter.promotor_id)
    }

    if (filter?.company_alias) {
      query = query
        .leftJoin('empresa', 'empresa.id', 'cupom.empresa_id')
        .where('empresa.company_alias', filter.company_alias)
    }

    return query.select('cupom.*').orderBy('cupom.created_at', 'desc').paginate(page, limit)
  }

  findOrFail(id: string, company_alias?: string) {
    const query = this.baseQuery().where('cupom.id', id)
    if (company_alias) {
      query.join('empresa', 'empresa.id', 'cupom.empresa_id').where('empresa.company_alias', company_alias)
    }
    return query.select('cupom.*').firstOrFail()
  }

  async create(data: CreatecupomDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias ?? '')

    const promotor = await Promotor.findOrFail(data.promotor_id)
    if (promotor.empresa_id !== null && promotor.empresa_id !== empresa.id) {
      throw new PromotorEmpresaMismatchException()
    }

    const codigo = data.codigo ?? (await this.gerarCodigoUnico())
    return cupom.create({
      promotor_id: data.promotor_id,
      codigo,
      desconto: data.desconto,
      validade: data.validade ? DateTime.fromJSDate(data.validade) : null,
      empresa_id: empresa.id,
    })
  }

  async update(id: string, data: UpdatecupomDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge({
      desconto: data.desconto,
      validade: data.validade ? DateTime.fromJSDate(data.validade) : r.validade,
    })
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.deletedAt = r.deletedAt ? null : DateTime.now()
    await r.save()
  }

  /** Usado ao fechar uma venda: cupão válido para redimir É preciso existir, não estar eliminado, não ter expirado, e pertencer à empresa da venda. */
  async findValidoPorCodigo(codigo: string, company_alias?: string) {
    return this.baseQuery()
      .join('empresa', 'empresa.id', 'cupom.empresa_id')
      .where('cupom.codigo', codigo.trim().toUpperCase())
      .where('empresa.company_alias', company_alias ?? '')
      .whereNull('cupom.deleted_at')
      .where((query) => {
        query.whereNull('cupom.validade').orWhere('cupom.validade', '>=', DateTime.now().toSQL()!)
      })
      .select('cupom.*')
      .first()
  }
}
