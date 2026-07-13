import project_role from './project_role.js'
import project_permission from './project_permission.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class project_permission_role extends BaseModel {
  static table = 'project_permission_role'

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
  static uuid(model: project_permission_role) {
    model.id ??= randomUUID()
  }

  @column()
  declare project_permission_id: string
  @belongsTo(() => project_permission)
  declare project_permission: BelongsTo<typeof project_permission>
  @column()
  declare project_role_id: string
  @belongsTo(() => project_role)
  declare project_role: BelongsTo<typeof project_role>
}
