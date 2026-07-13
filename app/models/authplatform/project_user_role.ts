import project_role from './project_role.js'
import project_user from './project_user.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class project_user_role extends BaseModel {
  static table = 'project_user_role'

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
  static uuid(model: project_user_role) {
    model.id ??= randomUUID()
  }

  @column()
  declare project_user_id: string
  @belongsTo(() => project_user)
  declare project_user: BelongsTo<typeof project_user>
  @column()
  declare project_role_id: string

  @belongsTo(() => project_role)
  declare project_role: BelongsTo<typeof project_role>
}
