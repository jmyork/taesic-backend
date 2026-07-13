import project from './project.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class project_user extends BaseModel {
  static table = 'project_user'

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
  static uuid(model: project_user) {
    model.id ??= randomUUID()
  }
  @column()
  declare username: string

  @column()
  declare email: string

  @column()
  declare password: string

  @column()
  declare project_id: string

  @belongsTo(() => project)
  declare project: BelongsTo<typeof project>
}
