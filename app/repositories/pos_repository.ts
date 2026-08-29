import { DateTime } from 'luxon'
import pos from '#models/faturacao/pos'
import { CreateposDTO, PosQueryDTO, UpdateposDTO } from '#dtos/pos_dto'
import Empresa from '#models/empresa'
import UltimoPostoException from '#exceptions/ultimo_posto_exception'
import { contarPostosActivos } from '../helpers/posto_padrao.js'
import db from '@adonisjs/lucid/services/db'
import { assertPodeCriarPosto } from '../helpers/limites_do_plano.js'

export default class posRepository {
  baseQuery() {
    return pos.query()
  }

  async paginate(page = 1, limit = 20, filter?: PosQueryDTO) {
    let query = this.baseQuery()

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('pos.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('pos.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('pos.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where('pos.created_at', '>=', new Date(filter.createdDtStart).toISOString())
    } else if (filter?.createdDtEnd) {
      query = query.where('pos.created_at', '<=', new Date(filter.createdDtEnd).toISOString())
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('pos.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where('pos.updated_at', '>=', new Date(filter.updatedDtStart).toISOString())
    } else if (filter?.updatedDtEnd) {
      query = query.where('pos.updated_at', '<=', new Date(filter.updatedDtEnd).toISOString())
    }

    // nome filter
    if (filter?.nome) {
      query = query.where('pos.nome', 'like', `%${filter.nome}%`)
    }

    // descricao filter
    if (filter?.localizacao) {
      query = query.where('pos.localizacao', 'like', `%${filter.localizacao}%`)
    }
    if (filter?.contacto) {
      query = query.where('pos.contacto', 'like', `%${filter.contacto}%`)
    }
    if (filter?.email) {
      query = query.where('pos.email', 'like', `%${filter.email}%`)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .leftJoin('empresa', 'empresa.id', 'pos.empresa_id') // leftJoin evita duplicatas
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query.where('pos.empresa_id', filter.empresa_id)
    }

    return await query.select('pos.*').orderBy('created_at', 'desc').paginate(page, limit)
  }

  /** Todos os pos associados ao user (via `userpos`), independentemente da empresa. */
  async listByUser(user_id: string, filter?: PosQueryDTO) {
    let query = this.baseQuery()
      .join('userpos', 'userpos.pos_id', 'pos.id')
      .where('userpos.user_id', user_id)
      .whereNull('userpos.deleted_at')

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('pos.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('pos.deleted_at')
    }

    // nome filter
    if (filter?.nome) {
      query = query.where('pos.nome', 'like', `%${filter.nome}%`)
    }

    return await query.select('pos.*').orderBy('pos.created_at', 'desc').paginate(filter?.page ?? 1, filter?.limit ?? 20)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('pos.id', id)
      .select(['pos.*'])
      .firstOrFail()
  }

  async create(data: CreateposDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const { empresa_id, company_alias, ...marcaData } = data

    // O plano manda em quantos postos a empresa pode ter. Aqui, e não no controller: um
    // limite que viva no controller é um limite que o próximo caminho não conhece.
    //
    // Dentro de uma transacção, e passando-lhe o `trx`, porque a verificação e a
    // criação têm de ser indivisíveis: `assertPodeCriarPosto` conta e depois insere-se,
    // e entre as duas coisas cabe outro pedido. Com o plano Grátis (1 posto), dois
    // cliques no botão liam ambos "0 postos", passavam ambos, e a empresa ficava com
    // dois. O lock é na linha da empresa — ver `limites_do_plano.ts`.
    return db.transaction(async (trx) => {
      await assertPodeCriarPosto(empresa.id, trx)
      return pos.create({ ...marcaData, empresa_id: empresa.id }, { client: trx })
    })
  }

  async update(id: string, data: UpdateposDTO, company_alias?: string) {
    const r = await this.findOrFail(id, company_alias)
    r.merge(data)
    await r.save()
    return r
  }

  /**
   * Alterna `deleted_at` (desactiva/reactiva), com uma condição: a empresa nunca pode
   * ficar sem nenhum posto de atendimento activo.
   *
   * A verificação só se aplica ao sentido DESACTIVAR. Reactivar nunca pode ser recusado
   * por esta regra — só aumenta a contagem — e um `if` que não distinguisse os dois
   * sentidos deixaria um posto apagado impossível de recuperar quando fosse o único.
   *
   * Porquê aqui e não no controller: `destroy` não é o único caminho que chega a este
   * método, e uma regra de integridade da empresa que viva no controller é uma regra que
   * o próximo caminho não conhece. Ver `app/helpers/posto_padrao.ts` para o que se
   * partia sem ela.
   */
  async softDelete(id: string, company_alias?: string) {
    const posto = await this.baseQuery()
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('pos.id', id)
      .select('pos.*')
      .firstOrFail()

    const aDesactivar = !posto.deletedAt
    if (aDesactivar && (await contarPostosActivos(posto.empresa_id)) <= 1) {
      throw new UltimoPostoException()
    }

    posto.deletedAt = posto.deletedAt ? null : DateTime.now()
    await posto.save()
  }
}
