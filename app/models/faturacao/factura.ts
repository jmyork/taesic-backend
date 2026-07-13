import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Empresa from '#models/empresa'
import vendas from './vendas.js'

export type FacturaTipo = 'Factura' | 'Factura-Recibo' | 'Nota de Crédito' | 'Nota de Débito'
export type FacturaStatus = 'emitida' | 'anulada'

export default class factura extends BaseModel {
  static table = 'factura'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: factura) {
    model.id ??= randomUUID()
  }

  @column()
  declare empresa_id: string

  @belongsTo(() => Empresa, { foreignKey: 'empresa_id' })
  declare empresa: BelongsTo<typeof Empresa>

  @column()
  declare venda_id: string

  @belongsTo(() => vendas, { foreignKey: 'venda_id' })
  declare venda: BelongsTo<typeof vendas>

  @column()
  declare numero: number

  @column()
  declare tipo: FacturaTipo

  @column()
  declare status: FacturaStatus

  @column()
  declare cliente_nome: string | null

  @column()
  declare cliente_nif: string | null

  @column()
  declare total: number

  @column.dateTime()
  declare data_emissao: DateTime

  @column()
  declare observacoes: string | null

  /**
   * factura_repository.baseQuery() junta `empresa` e seleciona campos extra (nome/nif/...) para
   * mostrar quem emitiu a factura sem um pedido adicional — colunas fora de @column() só
   * aparecem em $extras por omissão (nunca no JSON de resposta) a menos que serializeExtras()
   * as devolva explicitamente aqui.
   */
  serializeExtras() {
    return {
      empresa_nome: this.$extras.empresa_nome,
      empresa_nif: this.$extras.empresa_nif,
      empresa_localizacao: this.$extras.empresa_localizacao,
      empresa_contacto: this.$extras.empresa_contacto,
    }
  }
}
