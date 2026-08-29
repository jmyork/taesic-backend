import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Plano from '#models/plano'
import LimiteDoPlanoException from '#exceptions/limite_do_plano_exception'
import { bloquearEmpresaParaSequencial } from './sequencial_numero.js'

/**
 * Os limites do plano, impostos onde importa.
 *
 * Antes desta mudança, escolher um plano não mudava nada: o ecrã prometia "Até 3
 * utilizadores" ou "Produtos ilimitados" e o backend nunca olhava para isso. É o que o
 * dono do produto quis dizer com "as diferenças entre planos não existem".
 *
 * ── Duas regras que valem para tudo o que está aqui ────────────────────────────
 *
 * 1. **Sem plano, sem limite.** Uma empresa sem subscrição activa não é bloqueada. Um
 *    erro de configuração da plataforma (planos por semear, subscrição por criar, o
 *    backoffice a meio de uma migração) não pode transformar-se numa loja que deixa de
 *    poder vender. O limite é uma decisão comercial deliberada, e a ausência de dados
 *    nunca é uma decisão.
 * 2. **`null` é ilimitado.** Nunca zero. Ver o model `plano`.
 *
 * ── Onde é imposto ─────────────────────────────────────────────────────────────
 *
 * | limite | ponto de aplicação |
 * |---|---|
 * | utilizadores | `auth_repository.create()` — registar funcionário |
 * | postos | `pos_repository.create()` |
 * | produtos | `produtos_repository.create()`, `registrarProdutoAndDetalhes()` e a sementeira do onboarding (`semearRamosDeActuacao`) |
 * | facturação mensal | `vendas_repository.close()` |
 *
 * No repositório e não no controller, pela mesma razão que a regra do último posto: um
 * limite que viva no controller é um limite que o próximo caminho não conhece — um
 * comando ace, um import em massa, outro repositório.
 *
 * ── Duas armadilhas que já morderam ────────────────────────────────────────────
 *
 * **A criação em MASSA passa ao lado dos `assert*`.** Estes respondem a "posso criar
 * mais UM?". A sementeira do onboarding cria produtos às dezenas com um `createMany` e
 * durante algum tempo não perguntava nada: a união dos catálogos dos ramos são 174
 * produtos, o plano Grátis permite 150, e uma empresa que escolhesse ramos que
 * chegassem saía do onboarding acima do limite — para descobrir depois que o produto
 * seguinte era recusado, por um tecto que nunca soube ter ultrapassado. Para esses
 * caminhos há `espacoParaProdutos()`, que devolve quanto cabe.
 *
 * **Contar e depois inserir é uma corrida.** Entre as duas coisas cabe outro pedido, e
 * dois cliques no botão passavam ambos pelo mesmo limite. Todos os `assert*` aceitam
 * uma transacção e, quando a recebem, bloqueiam a linha da empresa — quem chama a
 * partir de um caminho de escrita TEM de a passar, senão a verificação continua a ser
 * só um aviso amigável.
 */

/** Nomes das colunas de contagem, para as mensagens saírem em português de negócio. */
type Recurso = 'utilizadores' | 'postos' | 'produtos'

const ROTULOS: Record<Recurso, { singular: string; plural: string }> = {
  utilizadores: { singular: 'utilizador', plural: 'utilizadores' },
  postos: { singular: 'posto de atendimento', plural: 'postos de atendimento' },
  produtos: { singular: 'produto', plural: 'produtos' },
}

export interface UsoDoPlano {
  plano: {
    id: string
    slug: string | null
    nome: string
    preco: number
    moeda: string
  } | null
  utilizadores: { usado: number; limite: number | null }
  postos: { usado: number; limite: number | null }
  produtos: { usado: number; limite: number | null }
  faturacao_mes: { usado: number; limite: number | null }
}

/**
 * O plano da subscrição activa desta empresa, ou `null`.
 *
 * "Activa" = não cancelada, não apagada, e ainda dentro de `data_fim` quando essa data
 * existe. Uma subscrição expirada devolve `null` — e, pela regra 1, isso significa **sem
 * limites**, não "bloqueado". Cortar o acesso a quem deixou de pagar é uma decisão de
 * cobrança, com aviso e prazo, e não um efeito colateral de uma data passar; quem a toma
 * é o backoffice, suspendendo a empresa (ver 7.15).
 */
export async function planoDaEmpresa(
  empresaId: string,
  trx?: TransactionClientContract
): Promise<Plano | null> {
  const cliente = trx ?? db.connection()
  const agora = DateTime.now().toSQL()!

  const linha = await cliente
    .from('subscricao')
    .join('plano', 'plano.id', 'subscricao.plano_id')
    .where('subscricao.cliente_id', empresaId)
    .whereNull('subscricao.deleted_at')
    .whereNull('subscricao.cancelada_em')
    .where((q) => {
      q.whereNull('subscricao.data_fim').orWhere('subscricao.data_fim', '>=', agora)
    })
    .orderBy('subscricao.created_at', 'desc')
    .select('plano.id as plano_id')
    .first()

  if (!linha) return null

  return Plano.query({ client: trx }).where('id', linha.plano_id).first()
}

/** Quanto é que esta empresa facturou no mês civil corrente (vendas fechadas). */
export async function faturacaoDoMes(
  empresaId: string,
  trx?: TransactionClientContract,
  agora: DateTime = DateTime.now()
): Promise<number> {
  const cliente = trx ?? db.connection()

  const linha = await cliente
    .from('vendas')
    .where('empresa_id', empresaId)
    // Mesmo critério de `caixa_repository.recalcularTotais()`: uma venda reembolsada já
    // tem o `total` reduzido pelo próprio reembolso, por isso somar os dois estados dá o
    // valor certo sem subtrair nada à parte.
    .whereIn('status', ['fechada', 'reembolsada'])
    .whereNull('deleted_at')
    .where('created_at', '>=', agora.startOf('month').toSQL()!)
    .where('created_at', '<=', agora.endOf('month').toSQL()!)
    .sum('total as total')
    .first()

  // O MySQL devolve SUM(DECIMAL) como string, e como NULL quando não há linhas.
  return Number(linha?.total ?? 0)
}

async function contar(
  tabela: 'user' | 'pos' | 'produtos',
  empresaId: string,
  trx?: TransactionClientContract
): Promise<number> {
  const cliente = trx ?? db.connection()

  const linha = await cliente
    .from(tabela)
    .where('empresa_id', empresaId)
    .whereNull('deleted_at')
    .count('* as total')
    .first()

  return Number(linha?.total ?? 0)
}

/**
 * O quadro completo para o ecrã de Subscrição: o que a empresa tem e o que o plano deixa.
 *
 * Numa só chamada porque é isso que o ecrã pede, e porque perguntar em separado deixaria
 * o utilizador a ver contagens de momentos diferentes.
 */
export async function usoDoPlano(
  empresaId: string,
  trx?: TransactionClientContract
): Promise<UsoDoPlano> {
  const plano = await planoDaEmpresa(empresaId, trx)

  const [utilizadores, postos, produtos, faturacao] = await Promise.all([
    contar('user', empresaId, trx),
    contar('pos', empresaId, trx),
    contar('produtos', empresaId, trx),
    faturacaoDoMes(empresaId, trx),
  ])

  return {
    plano: plano
      ? {
          id: plano.id,
          slug: plano.slug ?? null,
          nome: plano.nome,
          preco: Number(plano.preco),
          moeda: plano.moeda,
        }
      : null,
    utilizadores: { usado: utilizadores, limite: normalizarLimite(plano?.limite_utilizadores) },
    postos: { usado: postos, limite: normalizarLimite(plano?.limite_postos) },
    produtos: { usado: produtos, limite: normalizarLimite(plano?.limite_produtos) },
    faturacao_mes: {
      usado: faturacao,
      limite: normalizarLimite(plano?.limite_faturacao_mensal),
    },
  }
}

/** O limite deste recurso para este plano. `null` = ilimitado. */
function limiteDoRecurso(recurso: Recurso, plano: Plano): number | null {
  return normalizarLimite(
    recurso === 'utilizadores'
      ? plano.limite_utilizadores
      : recurso === 'postos'
        ? plano.limite_postos
        : plano.limite_produtos
  )
}

async function assertLimiteDeContagem(
  recurso: Recurso,
  tabela: 'user' | 'pos' | 'produtos',
  empresaId: string,
  trx?: TransactionClientContract
): Promise<void> {
  // ── Porque é que a transacção importa aqui ──────────────────────────────────
  //
  // Isto é um "conta e depois insere", e entre as duas coisas cabe outro pedido.
  // Com o plano Grátis (1 posto de atendimento), dois POST em paralelo liam ambos
  // `usado = 0`, passavam ambos, e a empresa ficava com dois postos — um limite que
  // se contorna carregando duas vezes no botão não é um limite.
  //
  // O lock é na linha da EMPRESA, a mesma que `proximoNumeroPorEmpresa` já bloqueia
  // para calcular sequenciais. Reutilizar essa linha (em vez de inventar outro
  // mutex) é o que garante que as duas coisas pedem sempre o mesmo recurso, na
  // mesma ordem — e portanto não há aqui como criar um deadlock novo.
  //
  // Sem `trx` a verificação continua a funcionar e continua a ser útil (recusa o
  // caso normal, sequencial); o que não dá é serializar. Quem chama a partir de um
  // caminho de escrita deve passar a transacção.
  if (trx) await bloquearEmpresaParaSequencial(trx, empresaId)

  const plano = await planoDaEmpresa(empresaId, trx)
  if (!plano) return // Regra 1: sem plano, sem limite.

  const limite = limiteDoRecurso(recurso, plano)
  if (limite === null) return // Ilimitado.

  const usado = await contar(tabela, empresaId, trx)
  if (usado < limite) return

  const rotulo = ROTULOS[recurso]
  throw new LimiteDoPlanoException(
    `O plano ${plano.nome} permite ${limite} ${limite === 1 ? rotulo.singular : rotulo.plural}, ` +
      `e a empresa já tem ${usado}. Actualize o plano para criar mais.`
  )
}

export function assertPodeCriarUtilizador(empresaId: string, trx?: TransactionClientContract) {
  return assertLimiteDeContagem('utilizadores', 'user', empresaId, trx)
}

export function assertPodeCriarPosto(empresaId: string, trx?: TransactionClientContract) {
  return assertLimiteDeContagem('postos', 'pos', empresaId, trx)
}

export function assertPodeCriarProduto(empresaId: string, trx?: TransactionClientContract) {
  return assertLimiteDeContagem('produtos', 'produtos', empresaId, trx)
}

/**
 * Quantos produtos ainda cabem no catálogo desta empresa. `null` = sem limite.
 *
 * Os `assert*` acima respondem a "posso criar MAIS UM?", que é a pergunta de quem
 * cria um produto de cada vez. O onboarding cria-os às dezenas — a união dos
 * catálogos dos ramos escolhidos vai até 174 produtos, e o plano Grátis permite 150.
 * Perguntar "posso criar mais um?" 174 vezes seria 174 idas à base de dados, e
 * recusar a 151ª com uma excepção partiria o passo do onboarding a meio.
 *
 * Daí uma pergunta diferente: quanto espaço há. Quem semeia corta a lista ao que
 * cabe e diz quantos ficaram de fora — ver `semearRamosDeActuacao`.
 *
 * Devolve 0 quando já não cabe nada (nunca um número negativo, mesmo que a empresa
 * esteja acima do limite por ter mudado de plano para um mais pequeno).
 */
export async function espacoParaProdutos(
  empresaId: string,
  trx?: TransactionClientContract
): Promise<number | null> {
  const plano = await planoDaEmpresa(empresaId, trx)
  if (!plano) return null // Regra 1: sem plano, sem limite.

  const limite = limiteDoRecurso('produtos', plano)
  if (limite === null) return null

  const usado = await contar('produtos', empresaId, trx)
  return Math.max(0, limite - usado)
}

/**
 * O tecto de facturação do plano gratuito.
 *
 * **Verificado ANTES de fechar a venda, contra o que já foi facturado mais esta venda.**
 * A alternativa — deixar passar e bloquear a seguinte — deixaria o tecto sempre
 * ultrapassado por uma venda, e um tecto que se ultrapassa não é um tecto.
 *
 * Recusar uma venda é a coisa mais agressiva que este sistema faz a um cliente, e é
 * deliberado: é o mecanismo que torna o plano gratuito sustentável. O que o torna
 * aceitável é a mensagem dizer exactamente quanto falta e o que fazer, e o ecrã de
 * Subscrição mostrar o consumo a subir muito antes de o tecto chegar.
 */
export async function assertPodeFacturar(
  empresaId: string,
  valorDaVenda: number,
  trx?: TransactionClientContract
): Promise<void> {
  const plano = await planoDaEmpresa(empresaId, trx)
  if (!plano) return

  const limite = normalizarLimite(plano.limite_faturacao_mensal)
  if (limite === null) return

  const jaFacturado = await faturacaoDoMes(empresaId, trx)
  const total = jaFacturado + Number(valorDaVenda ?? 0)
  if (total <= limite) return

  throw new LimiteDoPlanoException(
    `O plano ${plano.nome} permite facturar até ${formatarKz(limite)} por mês. ` +
      `Este mês já foram facturados ${formatarKz(jaFacturado)} e esta venda é de ` +
      `${formatarKz(Number(valorDaVenda ?? 0))}. Actualize o plano para continuar a vender.`
  )
}

/**
 * `null` (ilimitado) e `0` são coisas diferentes na base de dados, mas um limite de zero
 * nunca é o que alguém quis configurar — seria um plano que não deixa criar nada. Tratado
 * como ilimitado para um plano mal preenchido no backoffice não trancar uma empresa.
 */
function normalizarLimite(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero <= 0) return null
  return numero
}

/** "500.000 Kz" — o formato que o resto do produto usa. */
function formatarKz(valor: number): string {
  return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(valor)} Kz`
}
