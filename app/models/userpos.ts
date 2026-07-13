import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import pos from './faturacao/pos.js'

export default class userpos extends BaseModel {
  static table = 'userpos'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: userpos) {
    model.id ??= randomUUID()
  }

  @column()
  declare user_id: string
  @belongsTo(() => User, {
    foreignKey: 'user_id',
  })
  declare user: BelongsTo<typeof User>
  @column()
  declare pos_id: string

  @belongsTo(() => pos, { foreignKey: 'pos_id' })
  declare pos: BelongsTo<typeof pos>
}
