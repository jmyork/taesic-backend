import papel from './papel.js'
import User from '../user.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class UserPapel extends BaseModel {
  static table = 'user_papel'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column()
  declare enabled: boolean

  @beforeCreate()
  static uuid(model: UserPapel) {
    model.id ??= randomUUID()
  }

  @column()
  declare user_id: string

  @belongsTo(() => User)
  declare User: BelongsTo<typeof User>
  @column()
  declare papel_id: string
  @belongsTo(() => papel)
  declare papel: BelongsTo<typeof papel>
}
