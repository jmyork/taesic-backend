import empresa from './empresa.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class empresa_token_activacao extends BaseModel {
  static table = 'empresa_token_activacao'

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
  static uuid(model: empresa_token_activacao) {
    model.id ??= randomUUID()
  }

  @column()
  declare empresa_id: string
  @belongsTo(() => empresa)
  declare empresa: BelongsTo<typeof empresa>
  @column()
  declare token: string
}
