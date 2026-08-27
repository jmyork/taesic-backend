import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Empresa from '#models/empresa'
import EmpresaRamo from '#models/empresa_ramo'
import produtos from '#models/faturacao/produtos'
import produto_categorias from '#models/faturacao/produto_categorias'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  RAMOS_DE_ACTUACAO,
  RAMO_PERSONALIZADO,
  semearRamosDeActuacao,
  type ResultadoDaSementeira,
} from '../helpers/ramos_de_actuacao.js'
import { contarPostosActivos, semearPostoPadrao } from '../helpers/posto_padrao.js'
import assinaturaRepository from '#repositories/assinatura_repository'
import {
  AplicarRamosDTO,
  ConcluirOnboardingDTO,
  EstadoOnboardingDTO,
  resumirRamo,
} from '#dtos/onboarding_dto'

/**
 * O onboarding de uma empresa: escolher os ramos de actuação, semear o catálogo desses
 * ramos, e marcar o fim.
 *
 * ── Isolamento por tenant ──────────────────────────────────────────────────────
 *
 * Todos os métodos resolvem a empresa por `company_alias` (`findByOrFail`) e trabalham a
 * partir do `id` que daí sai. Não existe nenhum caminho que aceite um `empresa_id` vindo
 * do pedido — que é o que impede um inquilino de semear ou concluir o onboarding de
 * outro. Mesmo padrão de `pos_repository.create()`.
 *
 * ── Não estende `BaseRepository` ───────────────────────────────────────────────
 *
 * De propósito (secção 2 do CLAUDE.md): isto não é um CRUD. Não há listagem paginada, não
 * há `create`/`update`/`softDelete` de um recurso — há três operações de estado sobre a
 * empresa, uma delas transaccional. Forçá-lo ao molde genérico perdia comportamento sem
 * poupar uma linha.
 */
export default class onboardingRepository {
  /**
   * O que o ecrã de onboarding precisa de saber ao abrir: se já foi concluído, que ramos
   * estão escolhidos, o que a empresa já tem, e o catálogo de ramos por onde escolher.
   *
   * Numa só chamada em vez de cinco: este é o primeiro pedido de uma sessão nova, e é
   * feito antes de o utilizador poder fazer o que quer que seja.
   */
  async estado(companyAlias: string): Promise<EstadoOnboardingDTO> {
    const empresa = await Empresa.findByOrFail('company_alias', companyAlias)

    const [postos, totalProdutos, totalCategorias, escolhidos] = await Promise.all([
      contarPostosActivos(empresa.id),
      this.contar(produtos, empresa.id),
      this.contar(produto_categorias, empresa.id),
      EmpresaRamo.query().where('empresa_id', empresa.id).orderBy('created_at', 'asc'),
    ])

    return {
      concluido: empresa.onboardingConcluido,
      concluido_em: empresa.onboarding_concluido_em?.toISO() ?? null,
      ramo_actuacao: empresa.ramo_actuacao ?? null,
      ramos_actuacao: escolhidos.map((e) => e.ramo),
      postos_activos: postos,
      total_produtos: totalProdutos,
      total_categorias: totalCategorias,
      ramos: RAMOS_DE_ACTUACAO.map(resumirRamo),
    }
  }

  /**
   * Grava o CONJUNTO de ramos escolhidos e semeia o que eles trazem.
   *
   * `data.ramos` é o conjunto completo, não um acrescento: um ramo que estava escolhido e
   * não venha na lista deixa de estar. É o que faz a grelha de escolha múltipla do ecrã
   * comportar-se como o utilizador espera — desmarcar um cartão desmarca-o mesmo.
   *
   * **Desmarcar um ramo NÃO apaga o que ele semeou.** As categorias e os produtos ficam.
   * O dono pode já lhes ter posto preço, stock, ou até vendido — apagar-lhe catálogo por
   * ter desmarcado um cartão num ecrã de configuração seria destruir trabalho dele. O que
   * a escolha controla é o que é semeado a seguir, não o que já existe.
   *
   * As duas coisas numa transacção: uma empresa com "Farmácia" gravado mas sem o catálogo
   * desse ramo mente ao dono — o ecrã diria "Farmácia" e a lista de produtos estaria
   * vazia, sem nada a explicar porquê e sem forma de voltar a tentar (o passo já teria
   * sido dado). Ou fica escolhido e semeado, ou não fica nada.
   *
   * Também é o que permite a esta rota servir de "repor o catálogo do ramo" mais tarde, a
   * partir das definições, sem nenhum caminho novo.
   */
  async aplicarRamos(data: AplicarRamosDTO): Promise<ResultadoDaSementeira & { ramos: string[] }> {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const ramos = normalizarEscolha(data.ramos)

    return db.transaction(async (trx) => {
      const resultado = await semearRamosDeActuacao(empresa.id, ramos, trx)

      const jaEscolhidos = await EmpresaRamo.query({ client: trx }).where('empresa_id', empresa.id)
      const desejados = new Set(ramos)

      const aRemover = jaEscolhidos.filter((e) => !desejados.has(e.ramo)).map((e) => e.id)
      if (aRemover.length > 0) {
        await EmpresaRamo.query({ client: trx }).whereIn('id', aRemover).delete()
      }

      const presentes = new Set(jaEscolhidos.map((e) => e.ramo))
      const aInserir = ramos.filter((r) => !presentes.has(r))
      if (aInserir.length > 0) {
        await EmpresaRamo.createMany(
          aInserir.map((ramo) => ({ empresa_id: empresa.id, ramo })),
          { client: trx }
        )
      }

      // O principal é o primeiro da lista — o rótulo de uma linha só que `auth/me` e o
      // login devolvem. Mantido aqui, e em mais lado nenhum, para nunca divergir do
      // conjunto (ver a migração `create_empresa_ramo`).
      empresa.useTransaction(trx)
      empresa.ramo_actuacao = ramos[0] ?? null
      await empresa.save()

      return { ...resultado, ramos }
    })
  }

  /**
   * Marca o onboarding como concluído — e garante, antes disso, que a empresa tem mesmo
   * um posto de atendimento.
   *
   * A rede de segurança não é decorativa: as empresas registadas ANTES desta mudança não
   * passaram por `semearPostoPadrao` e podem chegar aqui sem nenhum posto. Deixá-las sair
   * do onboarding nesse estado seria mandá-las para um dashboard onde não se abre caixa
   * nem se vende — exactamente o que este trabalho veio resolver. É idempotente, portanto
   * não faz nada nas empresas que já têm posto (a esmagadora maioria).
   *
   * Repetir a conclusão não volta a mexer na data: a primeira é a que conta.
   */
  async concluir(data: ConcluirOnboardingDTO): Promise<Empresa> {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)

    return db.transaction(async (trx) => {
      empresa.useTransaction(trx)

      const dono = await trx.from('user').where('id', empresa.user_id).select('email').first()

      await semearPostoPadrao(empresa, dono?.email ?? '', trx)

      // Toda a empresa sai do onboarding com uma subscrição — a do plano gratuito, se o
      // dono não tiver escolhido outra. Sem ela, o ecrã de Subscrição não tinha nada para
      // mostrar e não havia caminho nenhum para pagar; e os limites do plano não se
      // aplicariam a ninguém, porque sem subscrição não há plano (ver `limites_do_plano`).
      //
      // Fora da transacção não daria: uma empresa que conclua o onboarding e falhe aqui
      // ficaria marcada como configurada e sem subscrição, sem forma de voltar ao passo.
      await new assinaturaRepository().garantirSubscricao(empresa.id, trx)

      if (!empresa.onboardingConcluido) {
        empresa.onboarding_concluido_em = DateTime.now()
        await empresa.save()
      }

      return empresa
    })
  }

  private async contar(
    modelo: { query: (opts?: any) => any },
    empresaId: string,
    trx?: TransactionClientContract
  ): Promise<number> {
    const linha = await modelo
      .query(trx ? { client: trx } : {})
      .where('empresa_id', empresaId)
      .whereNull('deleted_at')
      .count('* as total')
      .first()

    // mysql2 devolve COUNT() como string em alguns drivers/versões — normalizar aqui.
    return Number(linha?.$extras?.total ?? 0)
  }
}

/**
 * Tira repetidos e resolve a exclusividade de "Começar do zero".
 *
 * "Começar do zero" com outro ramo ao lado é uma contradição: um diz "não quero catálogo
 * de arranque" e o outro traz um. Em vez de recusar o pedido com um erro que o utilizador
 * teria de decifrar, vale a escolha mais informativa — se escolheu algum ramo a sério, é
 * isso que quer; "do zero" fica sozinho só quando é a única escolha.
 */
function normalizarEscolha(ramos: readonly string[]): string[] {
  const semRepetidos = [...new Set(ramos)]
  const comCatalogo = semRepetidos.filter((r) => r !== RAMO_PERSONALIZADO)

  return comCatalogo.length > 0 ? comCatalogo : [RAMO_PERSONALIZADO]
}
