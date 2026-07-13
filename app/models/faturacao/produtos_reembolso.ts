import user from '../user.js'
import venda_itens from './venda_itens.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class produtos_reembolso extends BaseModel {
  static table = 'produtos_reembolso'

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
  static uuid(model: produtos_reembolso) {
    model.id ??= randomUUID()
  }

  @column()
  declare venda_item_id: string
  @belongsTo(() => venda_itens, {
    foreignKey: 'venda_item_id',
  })
  declare venda_item: BelongsTo<typeof venda_itens>
  @column()
  declare user_id: string
  @belongsTo(() => user, {
    foreignKey: 'user_id',
  })
  declare user: BelongsTo<typeof user>
  @column()
  declare quantidade: number
}
