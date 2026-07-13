import Subscricao from './Subscricao.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class cobranca extends BaseModel {
  static table = 'cobranca'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: cobranca) {
    model.id ??= randomUUID()
  }

  @column()
  declare subscricao_id: string
  @belongsTo(() => Subscricao, {
    foreignKey: 'subscricao_id',
  })
  declare subscricao: BelongsTo<typeof Subscricao>
  @column()
  declare valor: number
  @column()
  declare moeda: string
  @column()
  declare status: string
  @column()
  declare data_emissao: Date
  @column()
  declare data_vencimento: Date
  @column()
  declare pago: boolean
  @column()
  declare referencia: string
}
