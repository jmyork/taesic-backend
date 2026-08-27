import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Empresa from '#models/empresa'
import Plano from '#models/plano'
import Subscricao from '#models/subscricao'
import Cobranca from '#models/cobranca'
import { planoDaEmpresa, usoDoPlano, type UsoDoPlano } from '../helpers/limites_do_plano.js'
import { MOEDA, planoDeArranque } from '../helpers/planos_padrao.js'

/**
 * Os valores que as colunas ENUM aceitam, em MAIÚSCULAS.
 *
 * `subscricao.status` e `cobranca.status` são `ENUM(...)` declarados assim nas migrações
 * originais. Escrever `'activa'` em minúsculas não dá erro de validação — dá
 * `Data truncated for column 'status'` do MySQL, no INSERT, e chega ao utilizador como um
 * 500 sem relação visível com a causa. Aqui, e só aqui, para nenhum chamador ter de
 * adivinhar a grafia.
 *
 * `SUBSTITUIDA` não existe no enum: uma subscrição trocada por outra fica `CANCELADA`,
 * com `cancelada_em` preenchida — que é exactamente o que aconteceu.
 */
const ESTADO_SUBSCRICAO = { activa: 'ATIVA', cancelada: 'CANCELADA' } as const
const ESTADO_COBRANCA = { pendente: 'PENDENTE' } as const

/**
 * A subscrição vista pelo lado da EMPRESA: que plano tem, quanto está a usar dele, o que
 * deve, e como muda de plano.
 *
 * Existia `domain_subscricao` e `domain_cobranca` — dois CRUD genéricos gerados, sem
 * nenhum ecrã por trás e sem forma de responder à pergunta que o dono de uma empresa faz
 * ("que plano tenho e quanto devo?"). Este repositório responde a essa pergunta; os CRUD
 * ficam onde estavam.
 *
 * ── Isolamento por tenant ──────────────────────────────────────────────────────
 *
 * Tudo resolve a empresa por `company_alias` e trabalha a partir do `id` que daí sai.
 * Nenhum método aceita `cliente_id`/`empresa_id` vindo do pedido.
 */
export default class assinaturaRepository {
  /** Os planos que uma empresa pode escolher. Só os activos, pela ordem do ecrã. */
  async planosDisponiveis(): Promise<Plano[]> {
    return Plano.query()
      .where('ativo', true)
      .whereNull('deleted_at')
      .orderBy('ordem', 'asc')
      .orderBy('preco', 'asc')
  }

  /** A subscrição corrente da empresa (a mais recente não cancelada), ou `null`. */
  async subscricaoActual(empresaId: string): Promise<Subscricao | null> {
    return Subscricao.query()
      .where('cliente_id', empresaId)
      .whereNull('deleted_at')
      .whereNull('cancelada_em')
      .orderBy('created_at', 'desc')
      .preload('plano')
      .first()
  }

  /**
   * Tudo o que o ecrã de Subscrição precisa, numa chamada.
   *
   * Junta o plano, o consumo real contra os limites, as cobranças e o catálogo — o ecrã
   * mostra as quatro coisas ao mesmo tempo, e pedi-las em separado deixaria o utilizador
   * a comparar números lidos em momentos diferentes.
   */
  async estado(companyAlias: string): Promise<{
    subscricao: {
      id: string
      status: string
      data_inicio: Date | null
      data_fim: Date | null
      renova: boolean
      em_periodo_livre: boolean
      dias_ate_ao_fim: number | null
    } | null
    uso: UsoDoPlano
    cobrancas: Cobranca[]
    planos: Plano[]
  }> {
    const empresa = await Empresa.findByOrFail('company_alias', companyAlias)

    const [subscricao, uso, planos] = await Promise.all([
      this.subscricaoActual(empresa.id),
      usoDoPlano(empresa.id),
      this.planosDisponiveis(),
    ])

    const cobrancas = subscricao
      ? await Cobranca.query()
          .where('subscricao_id', subscricao.id)
          .whereNull('deleted_at')
          .orderBy('created_at', 'desc')
          .limit(24)
      : []

    return {
      subscricao: subscricao ? this.resumirSubscricao(subscricao) : null,
      uso,
      cobrancas,
      planos,
    }
  }

  /**
   * Escolhe (ou muda para) um plano.
   *
   * **Uma subscrição de cada vez.** Mudar de plano cancela a anterior e abre uma nova, em
   * vez de reescrever a que existe: a subscrição anterior é o registo de que a empresa
   * esteve naquele plano naquelas datas, e é a ela que as cobranças já emitidas estão
   * ligadas. Reescrevê-la faria uma factura passada passar a dizer que era de outro plano.
   *
   * **Nenhum pagamento acontece aqui.** A nova subscrição arranca em período livre
   * (`plano.dias_gratuitos`) ou, se o plano for gratuito, sem fim nenhum. A cobrança e o
   * pagamento vivem no seu próprio caminho — ver `app/helpers/pagamentos/`.
   */
  async escolherPlano(companyAlias: string, planoId: string): Promise<Subscricao> {
    const empresa = await Empresa.findByOrFail('company_alias', companyAlias)
    const plano = await Plano.query()
      .where('id', planoId)
      .where('ativo', true)
      .whereNull('deleted_at')
      .firstOrFail()

    return db.transaction(async (trx) => {
      const actual = await Subscricao.query({ client: trx })
        .where('cliente_id', empresa.id)
        .whereNull('deleted_at')
        .whereNull('cancelada_em')
        .orderBy('created_at', 'desc')
        .first()

      // Já está neste plano: não abre uma segunda subscrição igual. Sem isto, carregar
      // duas vezes no mesmo cartão deixava a empresa com duas subscrições activas e a
      // pergunta "qual é a boa?" sem resposta.
      if (actual && actual.plano_id === plano.id) return actual

      if (actual) {
        actual.useTransaction(trx)
        actual.cancelada_em = new Date()
        actual.status = ESTADO_SUBSCRICAO.cancelada
        await actual.save()
      }

      const inicio = DateTime.now()
      const fim = plano.dias_gratuitos > 0 ? inicio.plus({ days: plano.dias_gratuitos }) : null

      return Subscricao.create(
        {
          cliente_id: empresa.id,
          plano_id: plano.id,
          // `activa` também no período livre: o que o período livre muda é quando a
          // primeira cobrança é emitida, não se a empresa pode trabalhar.
          status: ESTADO_SUBSCRICAO.activa,
          data_inicio: inicio.toJSDate(),
          data_fim: fim ? fim.toJSDate() : (null as unknown as Date),
          renova: true,
        },
        { client: trx }
      )
    })
  }

  /**
   * Garante que a empresa tem uma subscrição — a do plano gratuito, se não tiver nenhuma.
   *
   * Chamado no fim do onboarding. Uma empresa sem subscrição não fica bloqueada (ver a
   * regra 1 de `limites_do_plano.ts`), mas fica sem nada a mostrar no ecrã de Subscrição e
   * sem caminho para pagar — que é precisamente a lacuna que este trabalho veio fechar.
   *
   * Silencioso se não houver planos semeados: uma instalação mal configurada não pode
   * impedir alguém de terminar o onboarding.
   */
  async garantirSubscricao(
    empresaId: string,
    trx?: TransactionClientContract
  ): Promise<Subscricao | null> {
    const jaTem = await Subscricao.query({ client: trx })
      .where('cliente_id', empresaId)
      .whereNull('deleted_at')
      .whereNull('cancelada_em')
      .orderBy('created_at', 'desc')
      .first()
    if (jaTem) return jaTem

    const plano = await planoDeArranque(trx)
    if (!plano) return null

    const inicio = DateTime.now()
    const fim = plano.dias_gratuitos > 0 ? inicio.plus({ days: plano.dias_gratuitos }) : null

    return Subscricao.create(
      {
        cliente_id: empresaId,
        plano_id: plano.id,
        status: ESTADO_SUBSCRICAO.activa,
        data_inicio: inicio.toJSDate(),
        data_fim: fim ? fim.toJSDate() : (null as unknown as Date),
        renova: true,
      },
      { client: trx }
    )
  }

  /**
   * Emite a cobrança de uma subscrição, se ainda não houver uma por pagar.
   *
   * Idempotente de propósito: o ecrã de Subscrição chama isto quando o utilizador carrega
   * em "pagar", e carregar duas vezes não pode gerar duas dívidas. Devolve a cobrança
   * pendente que já existisse.
   *
   * Um plano gratuito não gera cobrança nenhuma — devolve `null`.
   */
  async emitirCobrancaPendente(companyAlias: string): Promise<Cobranca | null> {
    const empresa = await Empresa.findByOrFail('company_alias', companyAlias)

    const subscricao = await this.subscricaoActual(empresa.id)
    if (!subscricao) return null

    const plano = await planoDaEmpresa(empresa.id)
    if (!plano || Number(plano.preco) <= 0) return null

    const pendente = await Cobranca.query()
      .where('subscricao_id', subscricao.id)
      .where('pago', false)
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .first()

    if (pendente) return pendente

    const agora = DateTime.now()

    return Cobranca.create({
      subscricao_id: subscricao.id,
      valor: Number(plano.preco),
      moeda: plano.moeda ?? MOEDA,
      status: ESTADO_COBRANCA.pendente,
      data_emissao: agora.toJSDate(),
      // 8 dias: uma semana de folga mais um dia, para uma cobrança emitida à sexta não
      // vencer no fim-de-semana seguinte.
      data_vencimento: agora.plus({ days: 8 }).toJSDate(),
      pago: false,
      referencia: gerarReferencia(empresa.company_alias, agora),
    })
  }

  private resumirSubscricao(subscricao: Subscricao) {
    const fim = subscricao.data_fim ? DateTime.fromJSDate(new Date(subscricao.data_fim)) : null
    const diasAteAoFim = fim ? Math.ceil(fim.diffNow('days').days) : null

    return {
      id: subscricao.id,
      status: subscricao.status,
      data_inicio: subscricao.data_inicio ?? null,
      data_fim: subscricao.data_fim ?? null,
      renova: Boolean(subscricao.renova),
      // Há período livre enquanto houver uma data de fim por chegar e o plano custar
      // dinheiro. Um plano gratuito não tem período livre — é livre e pronto.
      em_periodo_livre: Boolean(fim && fim > DateTime.now() && Number(subscricao.plano?.preco) > 0),
      dias_ate_ao_fim: diasAteAoFim,
    }
  }
}

/**
 * A referência que identifica a cobrança fora do sistema.
 *
 * `cobranca.referencia` existia na tabela e nunca era preenchida. Enquanto o BAI Paga não
 * estiver ligado (ver o comentário no ecrã de Subscrição), é ela que torna a cobrança
 * pagável a sério: a empresa transfere e indica a referência, e quem confirma no
 * backoffice sabe a que cobrança pertence sem ter de adivinhar por valor e data.
 *
 * Formato `SUB-<alias>-<AAAAMM>-<4>`: legível ao telefone, com o inquilino e o mês à
 * vista, e um sufixo aleatório para duas cobranças do mesmo mês não colidirem. O alias é
 * truncado — os há longos, e uma referência que não cabe num campo de transferência não
 * serve para nada.
 */
function gerarReferencia(companyAlias: string, quando: DateTime): string {
  const alias = companyAlias.replace(/[^a-z]/gi, '').slice(0, 8).toUpperCase()
  const periodo = quando.toFormat('yyyyMM')
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase()

  return `SUB-${alias}-${periodo}-${sufixo}`
}
