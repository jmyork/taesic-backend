import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'
import ActivityLog, { type AlteracoesRegistadas } from '#models/activity_log'

/**
 * O registo de actividade do sistema — quem fez o quê, sobre que registo, e o que mudou.
 *
 * Segue de perto `app/helpers/security_logger.ts`, e pela mesma razão de fundo: a
 * escrita é **fire-and-forget**. Nunca deve atrasar nem partir o pedido que a
 * originou. Uma falha a gravar auditoria é registada no pino e morre aí — a
 * alternativa (propagar) faria uma tabela de registo derrubar operações de negócio,
 * que é exactamente o tipo de dependência que não se quer numa funcionalidade
 * acessória.
 *
 * O reverso é honesto e vale a pena escrevê-lo: **isto não é um registo à prova de
 * falhas.** Uma linha pode faltar se a base de dados estiver indisponível no momento
 * exacto da escrita. Serve para responder a "o que aconteceu aqui?" e para
 * reconstruir uma sequência de acontecimentos; não serve como prova irrefutável, e
 * não deve ser usado como se fosse.
 */

/**
 * Nomes de campo que NUNCA entram no registo, venha o valor de onde vier.
 *
 * A auditoria grava o "antes e depois" de escritas, e uma escrita em `user` traz a
 * password. Um registo que capture credenciais transforma a tabela de auditoria — que
 * por desenho é consultável por administradores de empresa e sobrevive ao apagar dos
 * dados que descreve — no sítio mais perigoso da base de dados.
 *
 * A comparação é por SUBSTRING e em minúsculas: apanha `password`,
 * `password_confirmation`, `senha_actual`, `access_token`, `refresh_token`,
 * `token_hash`. Prefere-se pecar por excesso — perder um campo do registo custa muito
 * menos do que guardar um segredo.
 */
const CAMPOS_SENSIVEIS = [
  'password',
  'senha',
  'token',
  'hash',
  'secret',
  'segredo',
  'authorization',
  'cookie',
  'cvv',
  'iban',
]

const ehSensivel = (campo: string) => {
  const c = campo.toLowerCase()
  return CAMPOS_SENSIVEIS.some((s) => c.includes(s))
}

/** Um valor grande truncado — um `changes` de 2 MB não ajuda ninguém a ler nada. */
const LIMITE_VALOR = 500

function limpar(valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor
  if (valor instanceof Date) return valor.toISOString()
  if (typeof valor === 'string') {
    return valor.length > LIMITE_VALOR ? `${valor.slice(0, LIMITE_VALOR)}… (truncado)` : valor
  }
  if (typeof valor === 'object') {
    // Objectos e listas passam por JSON e voltam truncados como texto: guardar a
    // estrutura inteira de uma relação pré-carregada encheria a tabela sem ganho.
    const texto = JSON.stringify(valor)
    return texto.length > LIMITE_VALOR ? `${texto.slice(0, LIMITE_VALOR)}… (truncado)` : valor
  }
  return valor
}

/** Sentinela para "não havia valor" — distinta de qualquer valor real. */
const AUSENTE = Symbol('ausente')

/**
 * A forma de um valor **para efeitos de comparação** (nunca para gravação).
 *
 * Existe por causa do driver. O mysql2 devolve `decimal` como TEXTO e `tinyint(1)`
 * como `0`/`1`, enquanto o que vem do pedido é `number` e `boolean`. Sem
 * normalizar, cada gravação de um preço aparecia como uma alteração de `100` para
 * `'100'`, e cada gravação de uma flag como `true` para `1` — e uma auditoria que
 * assinala alterações que não aconteceram é uma auditoria que ninguém lê.
 *
 * É a mesma classe de armadilha que o CLAUDE.md regista três vezes (`is_service`,
 * `regime_iva`, `disponivel`): comparar valores do driver com valores da aplicação
 * sem os pôr na mesma forma primeiro.
 */
function paraComparacao(valor: unknown): string | symbol {
  if (valor === null || valor === undefined) return AUSENTE
  if (typeof valor === 'boolean') return valor ? '1' : '0'
  if (valor instanceof Date) return valor.toISOString()
  if (typeof valor === 'number' || typeof valor === 'string') return String(valor)
  if (typeof valor === 'object') {
    // Um `DateTime` do Luxon e uma `Date` no mesmo instante têm de comparar iguais.
    const comoIso = (valor as { toISO?: () => string | null }).toISO
    if (typeof comoIso === 'function') return String(comoIso.call(valor))
    return JSON.stringify(valor)
  }
  return String(valor)
}

/**
 * O que mudou entre dois estados — **só os campos que mudaram**.
 *
 * Guardar a linha inteira duas vezes tornaria a tabela maior do que os dados que
 * descreve, e obrigaria quem lê a comparar 30 campos à procura do único que mexeu.
 */
export function diferencas(
  antes: Record<string, unknown> | null | undefined,
  depois: Record<string, unknown> | null | undefined
): AlteracoesRegistadas | null {
  const a = antes ?? {}
  const d = depois ?? {}
  const campos = new Set([...Object.keys(a), ...Object.keys(d)])

  // Sem protótipo, pela mesma razão de `limpar()` mais abaixo: um campo chamado
  // `__proto__` tem de aparecer no registo como qualquer outro, e não ser
  // engolido pelo setter.
  const mudouAntes = Object.create(null) as Record<string, unknown>
  const mudouDepois: Record<string, unknown> = {}

  for (const campo of campos) {
    if (ehSensivel(campo)) continue

    if (paraComparacao(a[campo]) === paraComparacao(d[campo])) continue

    // Guarda-se o valor limpo (truncado, datas em ISO), não a forma normalizada:
    // esta serve só para decidir se houve mudança.
    mudouAntes[campo] = limpar(a[campo])
    mudouDepois[campo] = limpar(d[campo])
  }

  if (Object.keys(mudouDepois).length === 0 && Object.keys(mudouAntes).length === 0) return null
  return { antes: mudouAntes, depois: mudouDepois }
}

/**
 * As larguras reais das colunas de texto de `activity_logs`.
 *
 * Isto não é zelo decorativo. O `sql_mode` deste projecto tem `STRICT_TRANS_TABLES`,
 * portanto um valor mais comprido do que a coluna **não** é truncado pelo motor: é um
 * erro 1406. E como a escrita é fire-and-forget, esse erro seria apanhado pelo
 * `.catch()` e a linha de auditoria desaparecia em silêncio — precisamente no caso em
 * que mais falta faz, porque o campo que rebenta a largura é o `description` de um
 * erro 500 com o stack trace lá dentro.
 */
const LARGURAS = {
  action: 100,
  subject_type: 100,
  subject_id: 64,
  description: 500,
  user_email: 254,
  user_nome: 255,
  ip_address: 45,
  method: 10,
  route: 255,
} as const

const cortar = (valor: string | null | undefined, largura: number): string | null => {
  if (valor === null || valor === undefined) return null
  return valor.length <= largura ? valor : `${valor.slice(0, largura - 1)}…`
}

/** O que substitui um valor sensível. Fica visível de propósito: quem lê vê que existia. */
export const REDIGIDO = '[redigido]'

/** Tecto por coluna de captura. Ver `redigir()`. */
const LIMITE_CAPTURA = 8_000

/**
 * Uma cópia de um valor **sem nada que não deva ser guardado**.
 *
 * É a peça que torna seguro guardar corpos de pedido e de resposta. Sem ela, esta
 * tabela — consultável no backoffice, e que sobrevive ao apagar dos dados que
 * descreve — teria as palavras-passe de toda a gente, os tokens de sessão e os dados
 * de pagamento em texto simples.
 *
 * Três regras:
 *
 * 1. **Por nome de campo, a qualquer profundidade.** `{ user: { password: 'x' } }` é
 *    redigido tal como `{ password: 'x' }`. A comparação é por substring e em
 *    minúsculas (a mesma de `diferencas()`), portanto apanha `password_confirmation`,
 *    `senha_actual`, `refresh_token`, `x-bff-secret`.
 * 2. **Peca por excesso.** Perder um campo do registo custa muito menos do que
 *    guardar um segredo. Um campo chamado `hash_do_produto` é redigido sem ser
 *    preciso, e não faz mal nenhum.
 * 3. **Trunca.** Um catálogo de produtos ou o corpo de um upload não cabem aqui nem
 *    devem caber — o objectivo é reconstruir o que aconteceu, não guardar uma segunda
 *    cópia da base de dados. O corte é marcado no valor, para quem lê saber que está
 *    a ver uma parte.
 *
 * Devolve `null` quando não há nada a guardar, para a coluna ficar NULL em vez de com
 * um `{}` que não diz nada.
 */
/**
 * Segredos reconhecidos pelo VALOR, não pelo nome do campo.
 *
 * A redacção por nome não chega, e isto não é hipotético: a resposta de
 * `POST auth/login` devolve o token de sessão num campo chamado `value`. Nenhuma lista
 * de nomes razoável apanha "value" — e redigir todos os campos com esse nome apagaria
 * metade dos dados legítimos. O resultado era o registo de auditoria a guardar
 * **sessões utilizáveis** de toda a gente que entrasse.
 *
 * Um token tem forma reconhecível, e é essa a defesa que funciona onde quer que ele
 * apareça: no corpo, num cabeçalho, no meio de uma mensagem de erro.
 *
 *   `oat_...`         tokens de acesso opacos do AdonisJS
 *   `Bearer <coisa>`  o cabeçalho, e qualquer sítio onde alguém o tenha copiado
 *   `eyJ...`          JWT (três blocos base64 separados por pontos)
 */
const VALORES_SENSIVEIS: RegExp[] = [
  /oat_[A-Za-z0-9._-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._-]{10,}/gi,
  /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g,
]

const redigirValor = (texto: string): string =>
  VALORES_SENSIVEIS.reduce((acc, padrao) => acc.replace(padrao, REDIGIDO), texto)

export function redigir(valor: unknown, limite = LIMITE_CAPTURA): unknown {
  if (valor === null || valor === undefined) return null

  const visitados = new WeakSet<object>()

  const limpar = (v: unknown, profundidade: number): unknown => {
    if (v === null || v === undefined) return v
    if (v instanceof Date) return v.toISOString()

    const tipo = typeof v
    if (tipo === 'string') return redigirValor(v as string)
    if (tipo === 'number' || tipo === 'boolean') return v
    if (tipo === 'function') return '[função]'
    if (tipo !== 'object') return String(v)

    // Um model do Lucid, ou um paginador, sabe serializar-se. Sem isto, o corpo da
    // resposta ficava com as ENTRANHAS do objecto — `transactionListener`,
    // `$attributes`, `fillInvoked` — em vez do JSON que o cliente recebeu, que é o
    // que a palavra "saída" quer dizer.
    const serializa = (v as { serialize?: () => unknown }).serialize
    if (typeof serializa === 'function' && !visitados.has(v as object)) {
      visitados.add(v as object)
      try {
        return limpar(serializa.call(v), profundidade)
      } catch {
        // Um `serialize()` que rebente não pode levar o registo com ele.
        return '[objecto não serializável]'
      }
    }

    // Um corpo com uma referência circular (ou um objecto do próprio framework que lá
    // vá parar) rebentaria o `JSON.stringify` — e a escrita é fire-and-forget, portanto
    // o registo desaparecia em silêncio em vez de dar erro.
    if (visitados.has(v as object)) return '[circular]'
    visitados.add(v as object)

    // Profundidade: um objecto muito aninhado não se lê num ecrã, e serializá-lo
    // inteiro é a forma mais fácil de encher a coluna com ruído.
    if (profundidade > 6) return '[…]'

    if (Array.isArray(v)) {
      // Uma listagem de 500 produtos não tem de estar aqui inteira para se perceber o
      // que a rota devolveu.
      const corte = v.slice(0, 50).map((x) => limpar(x, profundidade + 1))
      if (v.length > 50) corte.push(`[… mais ${v.length - 50} itens]`)
      return corte
    }

    // `Object.create(null)` e não `{}`: a CHAVE aqui vem do corpo do pedido (o
    // middleware de auditoria passa `ctx.request.body()`), portanto é escolhida
    // por quem faz o pedido.
    //
    // Num objecto normal, `saida['__proto__'] = x` não cria propriedade nenhuma —
    // invoca o setter de `__proto__`. Isto NÃO polui `Object.prototype` (o setter
    // só troca o protótipo deste objecto descartável), mas tem uma consequência
    // que importa num registo de AUDITORIA: o campo desaparecia do log sem deixar
    // rasto. Bastava chamar-lhe `__proto__` para o tornar invisível a quem
    // investigasse o pedido depois.
    //
    // Sem protótipo, `__proto__` passa a ser uma propriedade de dados normal e
    // fica registada como qualquer outra. `JSON.stringify` e `Object.keys`
    // funcionam na mesma sobre objectos sem protótipo.
    const saida: Record<string, unknown> = {}
    for (const [chave, item] of Object.entries(v as Record<string, unknown>)) {
      saida[chave] = ehSensivel(chave) ? REDIGIDO : limpar(item, profundidade + 1)
    }
    return saida
  }

  const limpo = limpar(valor, 0)

  if (limpo === null || limpo === undefined) return null
  if (typeof limpo === 'object' && Object.keys(limpo as object).length === 0) return null

  // O tecto final é sobre o TEXTO, que é o que ocupa a coluna. Um objecto que passe do
  // limite vira texto cortado — deixa de ser navegável no ecrã, mas continua legível,
  // e a alternativa era a linha inteira não caber e perder-se.
  const texto = JSON.stringify(limpo)
  if (texto.length <= limite) return limpo

  return {
    _truncado: true,
    _tamanho_original: texto.length,
    // Passa outra vez pela redacção por VALOR: o corte é sobre o texto já
    // serializado, e um token que estivesse lá dentro não voltaria a ser visto por
    // `limpar`. Redigir duas vezes não custa nada; falhar uma vez custa uma sessão.
    conteudo: redigirValor(texto.slice(0, limite)) + '…',
  }
}

/**
 * Os cabeçalhos do pedido, sem os que carregam identidade.
 *
 * `authorization` e `cookie` são apanhados por `ehSensivel`, mas ficam aqui escritos
 * por extenso porque são o caso que mais importa e o mais fácil de perder de vista: um
 * `Authorization: Bearer <token>` guardado numa tabela consultável é uma sessão
 * roubável de quem a ler.
 */
export function redigirCabecalhos(cabecalhos: Record<string, unknown> | undefined): unknown {
  if (!cabecalhos) return null
  return redigir(cabecalhos, 4_000)
}

export interface RegistoDeActividade {
  /** `create`, `update`, `delete`, `login`, `error`, ou um nome de negócio (`venda.fechar`). */
  action: string
  /** A tabela afectada (`produtos`, `vendas`). */
  subject_type?: string | null
  subject_id?: string | null
  changes?: AlteracoesRegistadas | null
  description?: string | null
  /** Só quando não há `ctx`, ou quando a acção é sobre outra empresa que não a do actor. */
  empresa_id?: string | null
  user_id?: string | null
  user_email?: string | null
  user_nome?: string | null
  status_code?: number | null

  /** Quanto tempo o pedido demorou, em milissegundos. */
  duration_ms?: number | null

  /**
   * O pedido e a resposta, tal como atravessaram a API.
   *
   * Passam SEMPRE por `redigir()` antes de chegarem à coluna — quem chama não tem de
   * se lembrar disso, e não tem como o contornar. Ver `activity_log_middleware.ts`.
   */
  request_headers?: unknown
  request_query?: unknown
  request_body?: unknown
  response_body?: unknown
}

/**
 * Grava uma linha de auditoria. Não devolve promessa a esperar de propósito: quem
 * chama não deve poder atrasar a resposta por causa disto.
 */
export function registarActividade(entrada: RegistoDeActividade, ctx?: HttpContext): void {
  // O actor vem do contexto autenticado, NUNCA do corpo do pedido: um `user_id`
  // aceite do cliente é um registo de auditoria que o próprio autor pode falsificar.
  // Lido DEPOIS de a acção correr (o middleware chama isto a seguir ao `next()`), que
  // é quando `middleware.auth()` já autenticou. Lê-lo antes daria sempre `null`.
  const utilizador = ctx?.auth?.user as
    | { id?: string; email?: string; username?: string; empresa_id?: string }
    | undefined

  const linha = {
    action: cortar(entrada.action, LARGURAS.action)!,
    subject_type: cortar(entrada.subject_type, LARGURAS.subject_type),
    subject_id: cortar(entrada.subject_id, LARGURAS.subject_id),
    changes: entrada.changes ?? null,
    description: cortar(entrada.description, LARGURAS.description),
    user_id: entrada.user_id ?? utilizador?.id ?? null,
    user_email: cortar(entrada.user_email ?? utilizador?.email, LARGURAS.user_email),
    user_nome: cortar(entrada.user_nome ?? utilizador?.username, LARGURAS.user_nome),
    empresa_id: entrada.empresa_id ?? utilizador?.empresa_id ?? null,
    ip_address: cortar(ctx?.request.ip(), LARGURAS.ip_address),
    method: cortar(ctx?.request.method(), LARGURAS.method),
    // O NOME da rota (`domain_produtos.store`), não o caminho: o caminho traz ids
    // dentro e não agrupa, e o nome é a mesma chave que o RBAC usa — o que permite
    // cruzar "quem tem esta permissão" com "quem a usou".
    route: cortar(ctx?.route?.name ?? ctx?.request.url(), LARGURAS.route),
    status_code: entrada.status_code ?? null,
    duration_ms: entrada.duration_ms ?? null,
    // A redacção acontece AQUI e não em quem chama: um ponto de passagem obrigatório
    // não se esquece, e é a diferença entre "guardamos o corpo com cuidado" e
    // "guardamos o corpo".
    request_headers: redigirCabecalhos(entrada.request_headers as Record<string, unknown>),
    request_query: redigir(entrada.request_query),
    request_body: redigir(entrada.request_body),
    response_body: redigir(entrada.response_body),
  }

  ActivityLog.create(linha).catch((error) => {
    logger.error(
      { err: error, action: entrada.action, subject_type: entrada.subject_type },
      '[auditoria] falha ao gravar em activity_logs'
    )
  })
}
