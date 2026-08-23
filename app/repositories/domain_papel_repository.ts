import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Papel, { ESCOPO_PAPEL } from '#models/auth/papel'
import Permissao from '#models/auth/permissao'
import papel_permissao from '#models/auth/papel_permissao'
import Empresa from '#models/empresa'
import PapelNomeReservadoException from '#exceptions/papel_nome_reservado_exception'
import SemGestaoDePapeisException from '#exceptions/sem_gestao_de_papeis_exception'
import PermissaoDesconhecidaException from '#exceptions/permissao_desconhecida_exception'
import { nomeDePapelReservado } from '../helpers/papeis_da_empresa.js'

/**
 * A empresa gere os SEUS papéis.
 *
 * Até aqui só o dono da plataforma podia mexer em papéis, e mexia nos de todos ao
 * mesmo tempo — eram partilhados. Com uma cópia por empresa, esta gestão passa
 * para quem é dono dela, que é o que estava pedido.
 *
 * As permissões continuam um catálogo global e só de leitura daqui: uma permissão
 * é o nome de uma rota, definido pelo código. O que a empresa escolhe é QUAIS das
 * permissões existentes cada um dos seus papéis tem.
 *
 * Toda a consulta filtra por `empresa_id` E por `escopo = 'empresa'`. As duas
 * condições, não uma: `empresa_id` sozinho parece bastar, mas é a segunda que
 * impede que um `modelo` ou um papel de plataforma — ambos com `empresa_id` nulo —
 * alguma vez apareça num caminho de tenant se uma consulta futura se enganar.
 */
export default class DomainPapelRepository {
  /** Permissão que decide quem consegue continuar a gerir papéis. Ver `assertNaoFicaSemGestao`. */
  private static readonly PERMISSAO_DE_GESTAO = 'domain_papel.update'

  private async empresaDe(companyAlias: string) {
    return Empresa.findByOrFail('company_alias', companyAlias)
  }

  private consultaBase(empresaId: string) {
    return Papel.query().where('empresa_id', empresaId).where('escopo', ESCOPO_PAPEL.empresa)
  }

  async paginate(data: DomainPapelQueryLike) {
    const empresa = await this.empresaDe(data.company_alias)
    const consulta = this.consultaBase(empresa.id).preload('permissao', (q) =>
      q.select('id', 'nome', 'descricao')
    )

    if (data.nome) consulta.where('nome', 'like', `%${data.nome}%`)

    if (data.deleted === 'deleted') consulta.whereNotNull('deleted_at')
    else if (data.deleted !== 'all') consulta.whereNull('deleted_at')

    return consulta.orderBy('nome', 'asc').paginate(data.page ?? 1, data.limit ?? 50)
  }

  async findOrFail(companyAlias: string, id: string) {
    const empresa = await this.empresaDe(companyAlias)
    return this.consultaBase(empresa.id)
      .where('id', id)
      .preload('permissao', (q) => q.select('id', 'nome', 'descricao'))
      .firstOrFail()
  }

  /**
   * O catálogo de permissões que esta empresa pode atribuir.
   *
   * Só as de domínio (`domain_*`). As de plataforma existem no mesmo catálogo mas
   * governam o backoffice; mostrá-las a um inquilino seria oferecer-lhe nomes que
   * ele nunca deve poder conceder — e conceder não o levaria a lado nenhum, porque
   * as rotas de plataforma passam por `adminOnly`, mas ficaria um papel a dizer
   * que dá um acesso que não dá.
   */
  async catalogoDePermissoes() {
    return Permissao.query()
      .where('nome', 'like', 'domain_%')
      .whereNull('deleted_at')
      .orderBy('nome', 'asc')
      .select('id', 'nome', 'descricao')
  }

  async create(data: CreateDomainPapelLike) {
    if (nomeDePapelReservado(data.nome)) throw new PapelNomeReservadoException()

    const empresa = await this.empresaDe(data.company_alias)

    return db.transaction(async (trx) => {
      // Um papel apagado com soft delete continua a ocupar o par (empresa, nome) no
      // índice único, portanto criar outro com o mesmo nome rebentaria com
      // ER_DUP_ENTRY. Revive-se, como já se faz em `domain_user_papel.assign()` e
      // em `concederPermissao()`.
      const apagado = await Papel.query({ client: trx })
        .where('empresa_id', empresa.id)
        .where('escopo', ESCOPO_PAPEL.empresa)
        .where('nome', data.nome)
        .whereNotNull('deleted_at')
        .first()

      let papel: Papel

      if (apagado) {
        apagado.deletedAt = null
        apagado.descricao = data.descricao ?? apagado.descricao
        await apagado.useTransaction(trx).save()
        papel = apagado
      } else {
        papel = await Papel.create(
          {
            nome: data.nome,
            descricao: data.descricao ?? '',
            empresa_id: empresa.id,
            escopo: ESCOPO_PAPEL.empresa,
          },
          { client: trx }
        )
      }

      if (data.permissoes) {
        await this.substituirPermissoes(papel, data.permissoes, trx)
      }

      return papel
    })
  }

  async update(data: UpdateDomainPapelLike) {
    if (data.nome && nomeDePapelReservado(data.nome)) throw new PapelNomeReservadoException()

    const empresa = await this.empresaDe(data.company_alias)

    return db.transaction(async (trx) => {
      const papel = await this.consultaBase(empresa.id)
        .useTransaction(trx)
        .where('id', data.id)
        .whereNull('deleted_at')
        .firstOrFail()

      if (data.nome !== undefined) papel.nome = data.nome
      if (data.descricao !== undefined) papel.descricao = data.descricao
      await papel.useTransaction(trx).save()

      // Ausente, as permissões ficam como estão — permite renomear sem tocar no
      // acesso de ninguém.
      if (data.permissoes !== undefined) {
        await this.substituirPermissoes(papel, data.permissoes, trx)
      }

      await this.assertNaoFicaSemGestao(empresa.id, trx)

      return papel
    })
  }

  async softDelete(data: { company_alias: string; id: string }) {
    const empresa = await this.empresaDe(data.company_alias)

    return db.transaction(async (trx) => {
      const papel = await this.consultaBase(empresa.id)
        .useTransaction(trx)
        .where('id', data.id)
        .firstOrFail()

      // Toggle, como o `softDelete` da BaseRepository: repor um papel apagado é a
      // mesma operação ao contrário.
      papel.deletedAt = papel.deletedAt ? null : DateTime.now()
      await papel.useTransaction(trx).save()

      await this.assertNaoFicaSemGestao(empresa.id, trx)

      return papel
    })
  }

  /** Substitui o conjunto completo de permissões do papel pelo indicado. */
  private async substituirPermissoes(
    papel: Papel,
    nomes: string[],
    trx: TransactionClientContract
  ) {
    // Só se atribui o que existe no catálogo, e só permissões de domínio. Um nome
    // desconhecido é ignorado em silêncio? Não — seria dizer a quem gere que o
    // papel ficou com uma permissão que não tem.
    const permissoes = nomes.length
      ? await Permissao.query({ client: trx })
          .whereIn('nome', [...new Set(nomes)])
          .where('nome', 'like', 'domain_%')
          .whereNull('deleted_at')
      : []

    const encontrados = new Set(permissoes.map((p) => p.nome))
    const desconhecidos = [...new Set(nomes)].filter((n) => !encontrados.has(n))

    if (desconhecidos.length > 0) {
      throw new PermissaoDesconhecidaException(
        `Permissões inexistentes ou fora do âmbito de empresa: ${desconhecidos.join(', ')}`
      )
    }

    // Apaga mesmo as ligações, não faz soft delete: `unique(papel_id,
    // permissao_id)` faria uma linha apagada bloquear a reatribuição futura — é o
    // mesmo raciocínio já documentado em `revogarPermissao()`.
    await papel_permissao.query({ client: trx }).where('papel_id', papel.id).delete()

    if (permissoes.length === 0) return

    await papel_permissao.createMany(
      permissoes.map((p) => ({ papel_id: papel.id, permissao_id: p.id })),
      { client: trx }
    )
  }

  /**
   * A empresa nunca pode ficar sem ninguém capaz de gerir papéis.
   *
   * É o footgun óbvio de delegar esta gestão: um Admin retira `domain_papel.update`
   * ao seu próprio papel — ou apaga-o — e a empresa fica trancada de fora da sua
   * própria gestão de acessos, sem forma de voltar atrás. Só o dono da plataforma
   * a poderia destrancar, com uma intervenção manual.
   *
   * A verificação corre DEPOIS da alteração, dentro da transacção: é a única forma
   * de perguntar "como fica isto?" em vez de tentar prever todos os caminhos que
   * lá chegam. Falhando, a transacção reverte e nada foi feito.
   */
  private async assertNaoFicaSemGestao(empresaId: string, trx: TransactionClientContract) {
    const quemGere = await trx
      .from('user_papel as up')
      .join('user as u', 'u.id', 'up.user_id')
      .join('papel as p', 'p.id', 'up.papel_id')
      .join('papel_permissao as pp', 'pp.papel_id', 'p.id')
      .join('permissao as perm', 'perm.id', 'pp.permissao_id')
      .where('u.empresa_id', empresaId)
      .where('p.empresa_id', empresaId)
      .where('p.escopo', ESCOPO_PAPEL.empresa)
      .where('perm.nome', DomainPapelRepository.PERMISSAO_DE_GESTAO)
      .whereNull('up.deleted_at')
      .whereNull('p.deleted_at')
      .whereNull('pp.deleted_at')
      .select('u.id')
      .first()

    if (!quemGere) throw new SemGestaoDePapeisException()
  }
}

interface DomainPapelQueryLike {
  company_alias: string
  page?: number
  limit?: number
  nome?: string
  deleted?: 'all' | 'deleted'
}

interface CreateDomainPapelLike {
  company_alias: string
  nome: string
  descricao?: string
  permissoes?: string[]
}

interface UpdateDomainPapelLike {
  company_alias: string
  id: string
  nome?: string
  descricao?: string
  permissoes?: string[]
}
