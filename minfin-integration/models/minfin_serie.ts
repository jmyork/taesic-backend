import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { randomUUID } from 'node:crypto'
import Empresa from '#models/empresa'
import type { EstadoSerie, MetodoFacturacao } from '../dominio/estados.js'
import type { TipoDocumento } from '../dominio/tipos_documento.js'

/** Uma série de numeração registada (ou por registar) na AGT. */
export default class MinfinSerie extends BaseModel {
  static table = 'minfin_serie'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: MinfinSerie) {
    model.id ??= randomUUID()
  }

  @column()
  declare empresa_id: string

  @belongsTo(() => Empresa, { foreignKey: 'empresa_id' })
  declare empresa: BelongsTo<typeof Empresa>

  @column()
  declare series_code: string

  @column()
  declare series_year: number

  @column()
  declare document_type: TipoDocumento

  @column()
  declare first_document_number: number

  @column()
  declare series_status: EstadoSerie | null

  @column()
  declare invoicing_method: MetodoFacturacao | null

  @column.dateTime()
  declare registada_em: DateTime | null

  @column()
  declare last_document_created: string | null

  @column()
  declare erros_json: string | null

  /**
   * Pode emitir-se nesta série?
   *
   * Três condições, e nenhuma é dispensável:
   *
   *  - `registada_em` — a AGT aceitou-a. Sem isto é um pedido nosso, não uma
   *    série (E34: "série da factura é inexistente para o contribuinte").
   *  - `deletedAt` a nulo — não foi retirada de circulação deste lado.
   *  - `series_status` diferente de `F` — uma série fechada é fechada, e o
   *    documento diz que fecha "após expirado o respectivo ano de emissão".
   *
   * `series_status` nulo NÃO impede: a AGT pode ter aceitado a série e ainda não
   * a ter listado, e recusar por isso pararia a facturação à espera de uma
   * chamada de reconciliação.
   */
  get utilizavel(): boolean {
    return this.registada_em !== null && this.deletedAt === null && this.series_status !== 'F'
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
