import permissao from './permissao.js'
import papel from './papel.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class papel_permissao extends BaseModel {
  static table = 'papel_permissao'

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
  static uuid(model: papel_permissao) {
    model.id ??= randomUUID()
  }

  @column()
  declare papel_id: string
  @belongsTo(() => papel, {
    foreignKey: 'papel_id',
  })
  declare papel: BelongsTo<typeof papel>
  @column()
  declare permissao_id: string
  @belongsTo(() => permissao, {
    foreignKey: 'permissao_id',
  })
  declare permissao: BelongsTo<typeof permissao>
}
