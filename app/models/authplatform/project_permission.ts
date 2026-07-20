import project from './project.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class project_permission extends BaseModel {
  static table = 'project_permission'

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
  static uuid(model: project_permission) {
    model.id ??= randomUUID()
  }

  @column()
  declare project_id: string
  @belongsTo(() => project, {
    foreignKey: 'project_id',
  })
  declare project: BelongsTo<typeof project>
  @column()
  declare name: string
  @column()
  declare descricao: string
}
