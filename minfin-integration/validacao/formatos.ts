/**
 * Predicados de formato e aritmética de dinheiro.
 *
 * Separado de `regras.ts` porque são coisas de natureza diferente: aqui está
 * "isto parece uma data?", ali está "este total bate certo com estas linhas?".
 * As primeiras são testáveis isoladamente e não conhecem o Blueprint; as
 * segundas são o Blueprint.
 */

/** `YYYY-MM-DD`, e uma data que existe mesmo (30 de Fevereiro não passa). */
export function eData(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false

  const [ano, mes, dia] = valor.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia))

  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
}

/**
 * ISO 8601 com fuso: `2025-05-27T14:30:00Z` ou `2025-05-27T14:30:00-03:00`.
 * É o formato de `submissionTimeStamp` (1.1.2).
 */
export function eTimestampComFuso(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(valor)) return false
  return !Number.isNaN(Date.parse(valor))
}

/**
 * ISO 8601 SEM fuso: `2025-05-27T14:30:00`. É o formato de `systemEntryDate`
 * (1.1.2.4), que o documento escreve explicitamente como
 * `YYYY-MM-DDThh:mm:ss` — sem `Z` e sem desvio.
 *
 * Aceitamos também a forma com fuso: um timestamp com informação a mais nunca é
 * menos preciso, e recusá-lo aqui seria inventar uma regra que o documento não
 * escreve.
 */
export function eTimestampLocal(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(valor)
}

/** UUID no formato standard (1.1.2, campo `submissionGUID`). */
export function eUuid(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
  )
}

/**
 * `submissionId` no formato `xxxxx-99999999-9999` das secções 1.2.2 a 1.7.2,
 * em que "x é um dígito do alfabeto letra" e "9 é um dígito numérico".
 */
export function eSubmissionId(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Za-z]{5}-\d{8}-\d{4}$/.test(valor)
}

export function eTextoEntre(valor: unknown, min: number, max: number): valor is string {
  return typeof valor === 'string' && valor.length >= min && valor.length <= max
}

export function eNumeroNaoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0
}

export function eNumeroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0
}

export function eInteiroDesde(valor: unknown, minimo: number): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo
}

/** Preenchido = existe, não é nulo, e não é a string vazia. */
export function preenchido(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false
  if (typeof valor === 'string') return valor.trim() !== ''
  return true
}

/* ────────────────────────────────────────────────────────────────────────────
 * Dinheiro
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Arredonda para `casas` casas decimais em unidades MENORES.
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
 * `number` originais. `0.1 + 0.2 === 0.3` é falso, e uma factura com três linhas
 * de 0,1 chega lá sozinha. Tolerância de uma unidade menor, porque as regras
 * E22–E25 comparam somas que passaram por rateios e câmbios.
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
 * O texto para o utilizador quando dois montantes deviam coincidir.
 *
 * Em português e com o separador decimal português — o documento exige que "os
 * caracteres e formatos numéricos portugueses" sejam suportados, e isso vale
 * para o que MOSTRAMOS. O JSON que sai para a AGT continua a levar números JSON,
 * com ponto decimal, porque é a única coisa que o formato permite. Ver
 * `DIVERGENCIAS.md` #C-07.
 */
export function formatarMontante(valor: number, casas: number): string {
  return arredondar(valor, casas).toFixed(casas).replace('.', ',')
}
