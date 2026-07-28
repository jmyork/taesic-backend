/**
 * Padrão de filtros repetido em ~6 repositórios (vendas, caixa, produtos, lote, estoque,
 * produtos_reembolso): `deleted` (enum), datas de auditoria em range, e por-recurso um
 * misto de "exato", "parcial (LIKE)" e "exato-ou-range" (`campo` vence sobre
 * `campo_start`/`campo_end` quando os dois vêm no pedido). Isto NÃO cobre o isolamento por
 * `company_alias`/`empresa_id` — cada recurso tem o seu próprio caminho de join (coluna
 * directa, FK a empresa, ou uma cadeia de várias tabelas) e continua escrito à mão em cada
 * repositório, tal como o `scopeToTenant` do `BaseRepository`.
 */

type RangeValue = number | string | Date

function toComparable(value: RangeValue) {
  return value instanceof Date ? value.toISOString() : value
}

function presente(value: unknown): value is RangeValue {
  return value !== undefined && value !== null
}

/** Aplica `>=`/`<=`/`whereBetween` conforme o que vier preenchido. */
export function applyRange(query: any, column: string, start?: RangeValue, end?: RangeValue) {
  const hasStart = presente(start)
  const hasEnd = presente(end)
  if (hasStart && hasEnd) {
    query.whereBetween(column, [toComparable(start), toComparable(end)])
  } else if (hasStart) {
    query.where(column, '>=', toComparable(start))
  } else if (hasEnd) {
    query.where(column, '<=', toComparable(end))
  }
}

/** `deleted=deleted` mostra só apagados, `deleted=all` mostra tudo, omisso mostra só os não-apagados. */
export function applyDeletedFilter(query: any, table: string, deleted?: 'deleted' | 'all' | null) {
  if (deleted === 'deleted') {
    query.whereNotNull(`${table}.deleted_at`)
  } else if (deleted !== 'all') {
    query.whereNull(`${table}.deleted_at`)
  }
}

export interface ExactFieldSpec {
  kind: 'exact'
  /** Nome da coluna qualificado com a tabela, ex.: `produtos.marca_id`. */
  column: string
  /** Chave correspondente no DTO de filtro. */
  key: string
}

export interface LikeFieldSpec {
  kind: 'like'
  column: string
  key: string
}

export interface RangeFieldSpec {
  kind: 'range'
  column: string
  startKey: string
  endKey: string
  /** Se preenchida, um valor exacto nesta chave vence sobre o par start/end. */
  exactKey?: string
}

export type FieldSpec = ExactFieldSpec | LikeFieldSpec | RangeFieldSpec

function applyField(query: any, filter: any, spec: FieldSpec) {
  if (spec.kind === 'exact') {
    const value = filter?.[spec.key]
    if (presente(value)) query.where(spec.column, value)
    return
  }

  if (spec.kind === 'like') {
    const value = filter?.[spec.key]
    if (value) query.where(spec.column, 'like', `%${value}%`)
    return
  }

  const exactValue = spec.exactKey ? filter?.[spec.exactKey] : undefined
  if (presente(exactValue)) {
    query.where(spec.column, exactValue)
  } else {
    applyRange(query, spec.column, filter?.[spec.startKey], filter?.[spec.endKey])
  }
}

/**
 * Aplica `deleted`, as datas de auditoria (`createdDtStart/End`, `updatedDtStart/End`) e a
 * lista de campos específicos do recurso. Isolamento por tenant (`company_alias`/
 * `empresa_id`, incl. os joins que isso exige) fica sempre de fora — continua a ser
 * responsabilidade de cada repositório, chamada depois deste helper.
 */
export function applyCommonFilters(
  query: any,
  filter: any,
  config: { table: string; fields?: FieldSpec[] }
) {
  const { table, fields = [] } = config

  applyDeletedFilter(query, table, filter?.deleted)
  applyRange(query, `${table}.created_at`, filter?.createdDtStart, filter?.createdDtEnd)
  applyRange(query, `${table}.updated_at`, filter?.updatedDtStart, filter?.updatedDtEnd)

  for (const spec of fields) applyField(query, filter, spec)

  return query
}
