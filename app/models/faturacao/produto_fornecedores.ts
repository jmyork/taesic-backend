import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import empresa from '#models/empresa'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class produto_fornecedores extends BaseModel {
  static table = 'produto_fornecedores'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: produto_fornecedores) {
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
