import Plano from './plano.js'
import Empresa from './empresa.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class subscricao extends BaseModel {
  static table = 'subscricao'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: subscricao) {
    model.id ??= randomUUID()
  }

  @column()
  declare cliente_id: string
  @belongsTo(() => Empresa, {
    foreignKey: 'cliente_id',
  })
  declare cliente: BelongsTo<typeof Empresa>
  @column()
  declare plano_id: string
  @belongsTo(() => Plano, {
    foreignKey: 'plano_id',
  })
  declare plano: BelongsTo<typeof Plano>
  @column()
  declare status: string
  @column()
  declare data_inicio: Date
  @column()
  declare data_fim: Date
  @column()
  declare renova: boolean
  @column()
  declare cancelada_em: Date
}
