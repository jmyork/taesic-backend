import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { randomUUID } from 'node:crypto'
import Promotor from '#models/promotor'

export default class PromotorOtp extends BaseModel {
  static table = 'promotor_otp'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeCreate()
  static uuid(model: PromotorOtp) {
    model.id ??= randomUUID()
  }

  @column()
  declare promotor_id: string

  @belongsTo(() => Promotor, { foreignKey: 'promotor_id' })
  declare promotor: BelongsTo<typeof Promotor>

  @column()
  declare codigo_hash: string

  @column.dateTime()
  declare expires_at: DateTime

  @column.dateTime()
  declare used_at: DateTime | null
}
