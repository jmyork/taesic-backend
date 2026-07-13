import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'

export default class Empresa extends BaseModel {
  static table = 'empresa'

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
  static uuid(model: Empresa) {
    model.id ??= randomUUID()
  }

  @column()
  declare user_id: string

  @column()
  declare nome: string

  @column()
  declare nif: string

  @column()
  declare tamanho: "pequena"|"media"|"grande"

  @column()
  declare status: boolean

  @column()
  declare inadiplente: boolean

  @column()
  declare regime_iva: boolean

  @column()
  declare company_alias: string

  @column()
  declare localizacao: string

  @column()
  declare contacto: string

  @column()
  declare verified: boolean
}
