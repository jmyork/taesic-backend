import produtos from './produtos.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class produto_contraindicacoes extends BaseModel {
  static table = 'produto_contraindicacoes'

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
  static uuid(model: produto_contraindicacoes) {
    model.id ??= randomUUID()
  }

  @column()
  declare produto_id: string

  @belongsTo(() => produtos)
  declare produto: BelongsTo<typeof produtos>

  @column()
  declare contraindicacao: string
}
