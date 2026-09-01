/**
 * Predicados de formato, normalização de números de telemóvel e aritmética de
 * dinheiro.
 *
 * Separado de `regras.ts` porque são coisas de natureza diferente: aqui está
 * "isto parece um número de telemóvel?", ali está "este total bate certo com
 * estas linhas?". As primeiras são testáveis isoladamente e não conhecem o BAI;
 * as segundas são o BAI.
 *
 * ── Porque é que a aritmética de dinheiro está duplicada do MINFIN ────────────
 *
 * Porque `minfin-integration/` e `baipaga-integration/` são dois módulos
 * fechados, cada um copiável para outro serviço sem arrastar o outro. Um
 * `shared/dinheiro.ts` compartilhado por integrações com dois terceiros
 * diferentes é a peça que acaba com um parâmetro para cada um deles. São trinta
 * linhas; a independência vale mais.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Números de telemóvel (MSISDN)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A forma que a API quer: dígitos, com indicativo, sem `+`. Ex.: `244923456789`.
 *
 * Só se valida o que a especificação escreve — indicativo mais número, tudo em
 * dígitos. Não se valida o comprimento angolano aqui porque o campo é
 * internacional e a API aceita clientes com outros indicativos; quem quiser essa
 * regra apertada usa `eMsisdnAngolano`.
 */
export function eMsisdn(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{8,15}$/.test(valor)
}

/** `244` + nove dígitos começados por 9 — a forma de um telemóvel angolano. */
export function eMsisdnAngolano(valor: unknown): valor is string {
  return typeof valor === 'string' && /^2449\d{8}$/.test(valor)
}

/**
 * Põe um número escrito à maneira de quem o escreve na forma que a API quer.
 *
 * Aceita `+244 923 456 789`, `00244923456789`, `923456789`, `923 456 789` e
 * devolve `244923456789`. Devolve `null` quando não consegue — e devolver `null`
 * é o ponto: enviar um número mal formado gasta uma chamada para receber
 * `INVALID_MSISDN_FORMAT`, e o cliente fica à espera enquanto isso acontece.
 *
 * Isto existe porque nenhum operador de caixa escreve `244923456789`. Escreve o
 * que está no papel, e o que está no papel tem espaços.
 */
export function normalizarMsisdn(valor: unknown, indicativoPais: string): string | null {
  if (typeof valor !== 'string') return null

  // Fora tudo o que não é dígito: espaços, hífenes, parênteses, pontos e o `+`.
  let digitos = valor.replace(/\D/g, '')
  if (digitos === '') return null

  // `00` à cabeça é o prefixo internacional escrito à antiga.
  if (digitos.startsWith('00')) digitos = digitos.slice(2)

  if (digitos.startsWith(indicativoPais)) {
    return eMsisdn(digitos) ? digitos : null
  }

  // Número nacional: nove dígitos começados por 9, em Angola. Aceita-se qualquer
  // comprimento plausível para não fechar a porta a outros indicativos, mas
  // exige-se que sobre alguma coisa depois do indicativo.
  if (digitos.length >= 8 && digitos.length <= 12) {
    const completo = `${indicativoPais}${digitos}`
    return eMsisdn(completo) ? completo : null
  }

  return null
}

/* ────────────────────────────────────────────────────────────────────────────
 * Outros formatos
 * ──────────────────────────────────────────────────────────────────────────── */

/** ISO 4217: três letras maiúsculas. */
export function eMoeda(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Z]{3}$/.test(valor)
}

/**
 * A referência externa.
 *
 * A especificação não declara comprimento nem alfabeto — só diz "unique
 * reference provided by the merchant" e mostra `ORDER-2024-001`. O limite de 120
 * é nosso e serve para apanhar aqui o que apanharia um `INVALID_PARAMETERS` lá.
 * Ver `DIVERGENCIAS.md` #C-05.
 */
export function eReferenciaExterna(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length >= 1 && valor.trim().length <= 120
}

/** ISO 8601 com ou sem fuso, como o que a API devolve em `expirationDate`. */
export function eTimestamp(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(valor)) return false
  return !Number.isNaN(Date.parse(valor))
}

export function eNumeroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0
}

export function eNumeroNaoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0
}

export function eInteiroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0
}

/** Preenchido = existe, não é nulo, e não é a cadeia vazia. */
export function preenchido(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false
  if (typeof valor === 'string') return valor.trim() !== ''
  return true
}

/* ────────────────────────────────────────────────────────────────────────────
 * Dinheiro
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Arredonda para `casas` casas decimais.
 *
 * `Math.round(v * 100) / 100` é a forma habitual e está errada em casos que
 * aparecem todos os dias: `Math.round(1.005 * 100)` dá 100, não 101, porque
 * 1.005 não é representável em vírgula flutuante binária e o que lá está é
 * 1.00499999999999989. O `Number.EPSILON` relativo empurra o valor o suficiente
 * para o lado certo sem afectar números que já estavam bem.
 */
export function arredondar(valor: number, casas: number): number {
  if (!Number.isFinite(valor)) return valor
  const factor = 10 ** casas
  return Math.round((valor + Number.EPSILON * Math.sign(valor) * Math.abs(valor)) * factor) / factor
}

/** O valor em unidades menores (cêntimos, para `casas = 2`). */
export function emUnidadesMenores(valor: number, casas: number): number {
  return Math.round(arredondar(valor, casas) * 10 ** casas)
}

/**
 * Dois montantes são o mesmo montante?
 *
 * A comparação é feita em INTEIROS de unidades menores, nunca com `===` sobre os
 * `number` originais. `0.1 + 0.2 === 0.3` é falso, e um carrinho com três linhas
 * de 0,1 chega lá sozinho. Tolerância de uma unidade menor, porque os totais
 * passam por rateios de desconto e por percentagens de IVA.
 */
export function montantesIguais(a: number, b: number, casas: number): boolean {
  return Math.abs(emUnidadesMenores(a, casas) - emUnidadesMenores(b, casas)) <= 1
}

/** Soma uma lista de montantes com o arredondamento feito UMA vez, no fim. */
export function somar(valores: Array<number | null | undefined>, casas: number): number {
  const total = valores.reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0)
  return arredondar(total, casas)
}

/**
 * O texto de um montante para o utilizador, com o separador decimal português.
 *
 * O JSON que sai para o BAI continua a levar números JSON, com ponto decimal,
 * porque é a única coisa que o formato permite. Isto é só para ecrãs e para
 * mensagens de erro.
 */
export function formatarMontante(valor: number, casas: number): string {
  return arredondar(valor, casas).toFixed(casas).replace('.', ',')
}
