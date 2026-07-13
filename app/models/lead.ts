import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { randomUUID } from 'node:crypto'
import Promotor from '#models/promotor'
import Empresa from '#models/empresa'

export default class Lead extends BaseModel {
  static table = 'lead'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeCreate()
  static uuid(model: Lead) {
    model.id ??= randomUUID()
  }

  @column()
  declare promotor_id: string

  @belongsTo(() => Promotor, { foreignKey: 'promotor_id' })
  declare promotor: BelongsTo<typeof Promotor>

  @column()
  declare empresa_id: string | null

  @belongsTo(() => Empresa, { foreignKey: 'empresa_id' })
  declare empresa: BelongsTo<typeof Empresa>
}
