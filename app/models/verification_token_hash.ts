import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import empresa from './empresa.js'

export default class VerificationTokenHash extends BaseModel {
  static table = 'verification_token_hash'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string | null

  @column()
  declare empresa_id: string | null

  @column()
  declare verification_token_public: string

  @column()
  declare purpose:
    | 'purpose'
    | 'account_activation'
    | 'account_activation_reply_token'
    | 'password_recovery'

  @column()
  declare verification_token_hash: string

  @column.dateTime()
  declare verification_token_expires_at: DateTime

  @column()
  declare verified: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: VerificationTokenHash) {
    model.id ??= randomUUID()
  }

  @belongsTo(() => User, {
    foreignKey: 'user_id',
  })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => empresa, {
    foreignKey: 'empresa_id',
  })
  declare empresa: BelongsTo<typeof empresa>
}
