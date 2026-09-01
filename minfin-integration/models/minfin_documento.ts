import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { randomUUID } from 'node:crypto'
import Empresa from '#models/empresa'
import Factura from '#models/faturacao/factura'
import MinfinSubmissao from './minfin_submissao.js'
import type { EstadoDocumento, MotivoAnulacao, VeredictoDocumento } from '../dominio/estados.js'
import type { TipoDocumento } from '../dominio/tipos_documento.js'

/**
 * Um documento dentro de uma submissão, com o veredicto da AGT.
 *
 * ⚠️ `document_status` e `veredicto` NÃO são o mesmo campo, apesar de o
 * Blueprint chamar `documentStatus` aos dois:
 *
 *   document_status  o que NÓS declarámos  N | S | A | R   (1.1.2.4)
 *   veredicto        o que a AGT respondeu V | I           (1.2.3.2)
 *
 * Um documento pode ser `A` (anulado por nós) e `V` (validamente comunicado) ao
 * mesmo tempo — anular uma factura é uma comunicação legítima. Juntá-los numa
 * coluna só perderia essa distinção.
 */
export default class MinfinDocumento extends BaseModel {
  static table = 'minfin_documento'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: MinfinDocumento) {
    model.id ??= randomUUID()
  }

  @column()
  declare submissao_id: string

  @belongsTo(() => MinfinSubmissao, { foreignKey: 'submissao_id' })
  declare submissao: BelongsTo<typeof MinfinSubmissao>

  @column()
  declare empresa_id: string

  @belongsTo(() => Empresa, { foreignKey: 'empresa_id' })
  declare empresa: BelongsTo<typeof Empresa>

  @column()
  declare factura_id: string | null

  @belongsTo(() => Factura, { foreignKey: 'factura_id' })
  declare factura: BelongsTo<typeof Factura>

  @column()
  declare document_no: string

  @column()
  declare document_type: TipoDocumento

  /** O que declarámos: N, S, A ou R. */
  @column()
  declare document_status: EstadoDocumento

  @column()
  declare document_cancel_reason: MotivoAnulacao | null

  @column.date()
  declare document_date: DateTime

  /** O que a AGT respondeu: V, I, ou nulo enquanto não respondeu. */
  @column()
  declare veredicto: VeredictoDocumento | null

  @column()
  declare hash: string | null

  @column()
  declare jws_document_signature: string | null

  @column()
  declare erros_json: string | null

  /**
   * A pergunta que se faz a partir do ecrã de uma factura: isto está bom aos
   * olhos da AGT?
   *
   * Três respostas, e a terceira é a que importa não confundir com as outras
   * duas: `null` é "ainda não sabemos", que NÃO é "está mal".
   */
  get valida(): boolean | null {
    if (this.veredicto === null) return null
    return this.veredicto === 'V'
  }

  get erros(): Array<{ errorCode: string; errorDescription: string }> {
    if (!this.erros_json) return []
    try {
      const lidos = JSON.parse(this.erros_json)
      return Array.isArray(lidos) ? lidos : []
    } catch {
      return []
    }
  }
}
