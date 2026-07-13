import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import empresa from '#models/empresa'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class produto_fabricantes extends BaseModel {
  static table = 'produto_fabricantes'

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
  static uuid(model: produto_fabricantes) {
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

  @column()
  declare empresa_id: string

  @belongsTo(() => empresa, {
    foreignKey: 'empresa_id',
  })
  declare empresa: BelongsTo<typeof empresa>
}
