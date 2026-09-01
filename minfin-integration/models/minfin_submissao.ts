import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { randomUUID } from 'node:crypto'
import Empresa from '#models/empresa'
import MinfinDocumento from './minfin_documento.js'

/**
 * Onde uma submissão está, do NOSSO ponto de vista.
 *
 * Não é o `resultCode` da AGT — esse vive em `result_code`. Este campo responde
 * a uma pergunta diferente e mais útil: "o que é que se faz a seguir com isto?".
 */
export type EstadoSubmissao =
  /** Montada, ainda não saiu — ou saiu e não sabemos. */
  | 'pendente'
  /** A AGT respondeu 4xx. Repetir com o mesmo conteúdo dá o mesmo erro. */
  | 'recusada'
  /** Não houve resposta. Repetir a MESMA submissão, mais tarde. */
  | 'indisponivel'
  /** Temos `requestID`. A validação diferida está a correr do lado deles. */
  | 'aceite'
  /** `obterEstado` deu um resultado final (0, 1 ou 2). */
  | 'concluida'
  /** `obterEstado` deu 9 — processamento cancelado. */
  | 'cancelada'

export const ESTADOS_SUBMISSAO: EstadoSubmissao[] = [
  'pendente',
  'recusada',
  'indisponivel',
  'aceite',
  'concluida',
  'cancelada',
]

export default class MinfinSubmissao extends BaseModel {
  static table = 'minfin_submissao'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: MinfinSubmissao) {
    model.id ??= randomUUID()
  }

  @column()
  declare empresa_id: string

  /**
   * `foreignKey` explícito, sempre — a inferência do Lucid assume `empresaId` em
   * camelCase e as colunas deste projecto são snake_case. É a regra da secção 6
   * do CLAUDE.md, e a origem de 17 relações partidas em silêncio (secção 7.2).
   */
  @belongsTo(() => Empresa, { foreignKey: 'empresa_id' })
  declare empresa: BelongsTo<typeof Empresa>

  /** O NIF tal como foi enviado — ver o comentário da migração. */
  @column()
  declare nif: string

  /** O `submissionGUID`/`submissionId` enviado. Chave de idempotência. */
  @column()
  declare submission_ref: string

  @column()
  declare request_id: string | null

  @column()
  declare estado: EstadoSubmissao

  @column()
  declare result_code: number | null

  @column()
  declare numero_documentos: number

  @column()
  declare tentativas_estado: number

  @column.dateTime()
  declare proxima_consulta_em: DateTime | null

  @column.dateTime()
  declare ultima_consulta_em: DateTime | null

  @column()
  declare pedido_json: string | null

  @column()
  declare resposta_json: string | null

  @column()
  declare erros_json: string | null

  @column()
  declare avisos_json: string | null

  @hasMany(() => MinfinDocumento, { foreignKey: 'submissao_id' })
  declare documentos: HasMany<typeof MinfinDocumento>

  /**
   * Ainda há alguma coisa a fazer com esta submissão?
   *
   * `concluida` e `cancelada` são finais; `recusada` também, porque repetir o
   * mesmo conteúdo devolve o mesmo erro — a correcção passa por emitir de novo,
   * não por insistir.
   */
  get emCurso(): boolean {
    return this.estado === 'pendente' || this.estado === 'indisponivel' || this.estado === 'aceite'
  }

  /** Está à espera do veredicto diferido da AGT? */
  get aguardaVeredicto(): boolean {
    return this.estado === 'aceite' && this.request_id !== null
  }

  /**
   * Os erros da última tentativa.
   *
   * Devolve `[]` em vez de lançar quando o JSON está corrompido: uma coluna de
   * diagnóstico ilegível não pode impedir o ecrã que a mostra de abrir — a linha
   * ainda tem estado, data e `request_id`, que é o que interessa nesse momento.
   */
  get erros(): Array<{ codigo: string; descricao: string; documentNo?: string }> {
    if (!this.erros_json) return []
    try {
      const lidos = JSON.parse(this.erros_json)
      return Array.isArray(lidos) ? lidos : []
    } catch {
      return []
    }
  }

  get avisos(): string[] {
    if (!this.avisos_json) return []
    try {
      const lidos = JSON.parse(this.avisos_json)
      return Array.isArray(lidos) ? lidos : []
    } catch {
      return []
    }
  }
}
