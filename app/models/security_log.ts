import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'

export default class SecurityLog extends BaseModel {
  static table = 'security_logs'

  @column({ isPrimary: true })
  declare id: string

  @beforeCreate()
  static uuid(model: SecurityLog) {
    model.id ??= randomUUID()
  }

  @column()
  declare event: string

  @column()
  declare ip: string | null

  @column({
    prepare: (value: Record<string, unknown> | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | null) => (value ? JSON.parse(value) : null),
  })
  declare details: Record<string, unknown> | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
