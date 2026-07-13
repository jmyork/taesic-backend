import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'

export default class produto_fabricante extends BaseModel {
  static table = 'produto_fabricante'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: produto_fabricante) {
    model.id ??= randomUUID()
  }

  @column()
  declare nome: string
  @column()
  declare email: string
  @column()
  declare telefone: string
  @column()
  declare endereco: string
}
