import user from '../user.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import project_role from './project_role.js'

export default class project extends BaseModel {
  static table = 'project'

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
  static uuid(model: project) {
    model.id ??= randomUUID()
  }

  @hasMany(() => project_role)
  declare project_roles: HasMany<typeof project_role>

  @column()
  declare nome: string
  @column()
  declare descricao: string
  @column()
  declare user_id: string
  @belongsTo(() => user, {
    foreignKey: 'user_id',
  })
  declare user: BelongsTo<typeof user>
}
