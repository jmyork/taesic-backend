import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Plano from '#models/plano'

/**
 * Os planos com que a plataforma arranca.
 *
 * ── O modelo de negócio que estes números exprimem ─────────────────────────────
 *
 * Barato, e a ganhar por volume: o plano gratuito não é uma amostra de 14 dias, é uma
 * conta a sério, para sempre, com um TECTO DE FACTURAÇÃO. Quem factura pouco não paga
 * nada — e quando o negócio cresce ao ponto de o tecto incomodar, já é um negócio que
 * pode pagar. É o contrário de um período experimental: não expira, cresce com o cliente.
 *
 * Os limites de utilizadores/postos/produtos existem para os planos pagos se distinguirem
 * entre si; o tecto de facturação é o que separa o grátis do pago.
 *
 * ── ⚠️ Os NÚMEROS são um ponto de partida, não uma decisão fechada ────────────
 *
 * Preços e limites são decisão comercial e mudam sem deploy: `plano` tem CRUD no
 * `taesic-backoffice-api` (`platform_plano.*`). Esta lista só garante que uma instalação
 * nova não fica sem planos nenhuns — que é o estado em que estava (tabela `plano` vazia,
 * e o ecrã de onboarding a mostrar planos inventados no frontend, em euros).
 *
 * ── Idempotente por `slug` ─────────────────────────────────────────────────────
 *
 * Correr isto duas vezes não duplica nada, e **não sobrepõe** o que já lá está: um preço
 * afinado no backoffice não pode ser revertido pelo próximo deploy. Só cria o que falta.
 */

export interface PlanoPadrao {
  slug: string
  nome: string
  descricao: string
  /** Em Kwanza, por mês. */
  preco: number
  /** `null` = ilimitado. */
  limite_utilizadores: number | null
  limite_postos: number | null
  limite_produtos: number | null
  limite_faturacao_mensal: number | null
  dias_gratuitos: number
  funcionalidades: string[]
  ordem: number
}

export const MOEDA = 'AOA'
export const PERIODO_MENSAL = 'mensal'

/** O plano em que uma empresa nova entra se não escolher nenhum. */
export const SLUG_PLANO_GRATUITO = 'gratuito'

export const PLANOS_PADRAO: readonly PlanoPadrao[] = [
  {
    slug: SLUG_PLANO_GRATUITO,
    nome: 'Grátis',
    descricao: 'Para começar. Sem prazo e sem cartão — paga só quando o negócio crescer.',
    preco: 0,
    limite_utilizadores: 2,
    limite_postos: 1,
    limite_produtos: 150,
    limite_faturacao_mensal: 500_000,
    dias_gratuitos: 0,
    funcionalidades: [
      'Ponto de venda e controlo de stock',
      'Facturas e relatórios essenciais',
    ],
    ordem: 1,
  },
  {
    slug: 'basico',
    nome: 'Básico',
    descricao: 'Para quem já vende todos os dias e passou o tecto do plano gratuito.',
    preco: 7_500,
    limite_utilizadores: 6,
    limite_postos: 3,
    limite_produtos: 2_000,
    limite_faturacao_mensal: null,
    dias_gratuitos: 14,
    funcionalidades: [
      'Relatórios completos',
      'Alertas de stock e de validade',
    ],
    ordem: 2,
  },
  {
    slug: 'pro',
    nome: 'Pro',
    descricao: 'Para operações com várias lojas e equipas grandes.',
    preco: 19_900,
    limite_utilizadores: null,
    limite_postos: null,
    limite_produtos: null,
    limite_faturacao_mensal: null,
    dias_gratuitos: 14,
    funcionalidades: [
      'Relatórios completos e comparativos',
      'Gestão de promotores e cupões',
    ],
    ordem: 3,
  },
]

/**
 * Cria os planos em falta. Devolve os que foram criados (vazio se já lá estavam todos).
 *
 * `trx` é opcional para poder correr dentro de outra transacção (seeder, comando ace).
 */
export async function semearPlanosPadrao(trx?: TransactionClientContract): Promise<Plano[]> {
  const existentes = await Plano.query({ client: trx }).whereNotNull('slug').select('slug')
  const jaExistem = new Set(existentes.map((p) => p.slug))

  const emFalta = PLANOS_PADRAO.filter((p) => !jaExistem.has(p.slug))
  if (emFalta.length === 0) return []

  return Plano.createMany(
    emFalta.map((p) => ({
      slug: p.slug,
      nome: p.nome,
      descricao: p.descricao,
      preco: p.preco,
      moeda: MOEDA,
      periodo: PERIODO_MENSAL,
      ativo: true,
      limite_utilizadores: p.limite_utilizadores,
      limite_postos: p.limite_postos,
      limite_produtos: p.limite_produtos,
      limite_faturacao_mensal: p.limite_faturacao_mensal,
      dias_gratuitos: p.dias_gratuitos,
      funcionalidades: p.funcionalidades,
      ordem: p.ordem,
    })),
    { client: trx }
  )
}

/**
 * O plano gratuito, ou — se alguém o tiver desactivado no backoffice — o mais barato que
 * esteja activo.
 *
 * Devolve `null` quando não há plano nenhum. Quem chama tem de saber lidar com isso: uma
 * instalação sem planos é um erro de configuração, mas não pode ser motivo para impedir
 * uma empresa de se registar (ver `limites_do_plano.ts`, que sem plano não impõe nada).
 */
export async function planoDeArranque(trx?: TransactionClientContract): Promise<Plano | null> {
  const gratuito = await Plano.query({ client: trx })
    .where('slug', SLUG_PLANO_GRATUITO)
    .where('ativo', true)
    .whereNull('deleted_at')
    .first()

  if (gratuito) return gratuito

  return Plano.query({ client: trx })
    .where('ativo', true)
    .whereNull('deleted_at')
    .orderBy('preco', 'asc')
    .orderBy('ordem', 'asc')
    .first()
}
