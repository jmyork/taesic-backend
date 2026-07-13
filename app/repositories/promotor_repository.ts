import { DateTime } from 'luxon'
import { randomBytes } from 'node:crypto'
import Promotor from '#models/promotor'
import Empresa from '#models/empresa'
import { CreatePromotorDTO, PromotorQueryDTO, UpdatePromotorDTO } from '#dtos/promotor_dto'

export default class PromotorRepository {
  baseQuery() {
    return Promotor.query()
  }

  /** Slug curto e único para o link público de perfil (/p/:codigo_perfil). */
  private async gerarCodigoPerfilUnico(): Promise<string> {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const codigo = randomBytes(5).toString('hex')
      const existe = await Promotor.query().where('codigo_perfil', codigo).first()
      if (!existe) return codigo
    }
    throw new Error('Não foi possível gerar um código de perfil único — tente novamente.')
  }

  async paginate(page = 1, limit = 20, filter?: PromotorQueryDTO) {
    let query = this.baseQuery()

    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('promotor.deleted_at')
    } else if (filter?.deleted !== 'all') {
      query = query.whereNull('promotor.deleted_at')
    }

    if (filter?.company_alias) {
      if (filter.incluir_plataforma) {
        // Precisa de LEFT JOIN (não join normal): um promotor de plataforma tem empresa_id
        // null, por isso um join normal contra `empresa` eliminava-o do resultado por completo.
        query = query
          .leftJoin('empresa', 'empresa.id', 'promotor.empresa_id')
          .where((builder) => {
            builder.where('empresa.company_alias', filter.company_alias!).orWhereNull('promotor.empresa_id')
          })
      } else {
        query = query
          .join('empresa', 'empresa.id', 'promotor.empresa_id')
          .where('empresa.company_alias', filter.company_alias)
      }
    }

    return query.select('promotor.*').orderBy('promotor.created_at', 'desc').paginate(page, limit)
  }

  findOrFail(id: string, company_alias?: string) {
    const query = this.baseQuery().where('promotor.id', id)
    if (company_alias) {
      query.join('empresa', 'empresa.id', 'promotor.empresa_id').where('empresa.company_alias', company_alias)
    }
    return query.select('promotor.*').firstOrFail()
  }

  findByEmail(email: string) {
    return Promotor.query().where('email', email.trim().toLowerCase()).whereNull('deleted_at').first()
  }

  findByCodigoPerfil(codigo_perfil: string) {
    return Promotor.query().where('codigo_perfil', codigo_perfil).whereNull('deleted_at').first()
  }

  /** `company_alias` presente = promotor de domínio (fica associado a essa empresa);
   *  ausente = promotor de plataforma (empresa_id null, pode ter cupões em qualquer empresa). */
  async create(data: CreatePromotorDTO) {
    let empresaId: string | null = null
    if (data.company_alias) {
      const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
      empresaId = empresa.id
    }

    const codigo_perfil = await this.gerarCodigoPerfilUnico()
    return Promotor.create({
      nome: data.nome,
      email: data.email.trim().toLowerCase(),
      telefone: data.telefone ?? null,
      empresa_id: empresaId,
      codigo_perfil,
      ativo: true,
    })
  }

  async update(id: string, data: UpdatePromotorDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  async softDelete(id: string, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.deletedAt = r.deletedAt ? null : DateTime.now()
    await r.save()
  }
}
