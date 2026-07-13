import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, manyToMany } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import permissao from './permissao.js'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'

export default class Papel extends BaseModel {
  static table = 'papel'

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
  static uuid(model: Papel) {
    model.id ??= randomUUID()
  }

  @manyToMany(() => permissao, {
    relatedKey: 'id',
    localKey: 'id',
    pivotForeignKey: 'papel_id',
    pivotRelatedForeignKey: 'permissao_id',
  })
  declare permissao: ManyToMany<typeof permissao>

  @column()
  declare nome: string
  @column()
  declare descricao: string
}
