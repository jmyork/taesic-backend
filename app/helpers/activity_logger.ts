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

  const mudouAntes: Record<string, unknown> = {}
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
  ip_address: 45,
  method: 10,
  route: 255,
} as const

const cortar = (valor: string | null | undefined, largura: number): string | null => {
  if (valor === null || valor === undefined) return null
  return valor.length <= largura ? valor : `${valor.slice(0, largura - 1)}…`
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
  status_code?: number | null
}

/**
 * Grava uma linha de auditoria. Não devolve promessa a esperar de propósito: quem
 * chama não deve poder atrasar a resposta por causa disto.
 */
export function registarActividade(entrada: RegistoDeActividade, ctx?: HttpContext): void {
  // O actor vem do contexto autenticado, NUNCA do corpo do pedido: um `user_id`
  // aceite do cliente é um registo de auditoria que o próprio autor pode falsificar.
  const utilizador = ctx?.auth?.user as { id?: string; email?: string; empresa_id?: string } | undefined

  const linha = {
    action: cortar(entrada.action, LARGURAS.action)!,
    subject_type: cortar(entrada.subject_type, LARGURAS.subject_type),
    subject_id: cortar(entrada.subject_id, LARGURAS.subject_id),
    changes: entrada.changes ?? null,
    description: cortar(entrada.description, LARGURAS.description),
    user_id: entrada.user_id ?? utilizador?.id ?? null,
    user_email: cortar(entrada.user_email ?? utilizador?.email, LARGURAS.user_email),
    empresa_id: entrada.empresa_id ?? utilizador?.empresa_id ?? null,
    ip_address: cortar(ctx?.request.ip(), LARGURAS.ip_address),
    method: cortar(ctx?.request.method(), LARGURAS.method),
    // O NOME da rota (`domain_produtos.store`), não o caminho: o caminho traz ids
    // dentro e não agrupa, e o nome é a mesma chave que o RBAC usa — o que permite
    // cruzar "quem tem esta permissão" com "quem a usou".
    route: cortar(ctx?.route?.name ?? ctx?.request.url(), LARGURAS.route),
    status_code: entrada.status_code ?? null,
  }

  ActivityLog.create(linha).catch((error) => {
    logger.error(
      { err: error, action: entrada.action, subject_type: entrada.subject_type },
      '[auditoria] falha ao gravar em activity_logs'
    )
  })
}
