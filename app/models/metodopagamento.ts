import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Empresa from '#models/empresa'

export default class metodopagamento extends BaseModel {
  static table = 'metodopagamento'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: metodopagamento) {
    model.id ??= randomUUID()
  }

  @column()
  declare nome: string
  @column()
  declare descricao: string

  @column()
  declare empresa_id: string

  @belongsTo(() => Empresa, {
    foreignKey: 'empresa_id',
  })
  declare empresa: BelongsTo<typeof Empresa>
}
