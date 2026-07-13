import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'

export default class plano extends BaseModel {
  static table = 'plano'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: plano) {
    model.id ??= randomUUID()
  }

  @column()
  declare nome: string
  @column()
  declare descricao: string
  @column()
  declare preco: number
  @column()
  declare moeda: string
  @column()
  declare periodo: string
  @column()
  declare ativo: boolean
  @column()
  declare limite_uso: number
}
