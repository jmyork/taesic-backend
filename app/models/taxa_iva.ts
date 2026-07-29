import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'

export default class taxa_iva extends BaseModel {
  static table = 'taxa_iva'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: taxa_iva) {
    model.id ??= randomUUID()
  }

  @column()
  declare nome: string
  @column()
  declare percentual: number
  @column()
  declare ativo: boolean
}
