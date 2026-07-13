import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { randomUUID } from 'node:crypto'
import Empresa from '#models/empresa'
import Cupom from '#models/cupom'
import Lead from '#models/lead'

export default class Promotor extends BaseModel {
  static table = 'promotor'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: Promotor) {
    model.id ??= randomUUID()
  }

  @column()
  declare nome: string

  @column()
  declare email: string

  @column()
  declare telefone: string | null

  /** null = promotor da plataforma; preenchido = promotor de uma empresa (domain) específica. */
  @column()
  declare empresa_id: string | null

  @belongsTo(() => Empresa, { foreignKey: 'empresa_id' })
  declare empresa: BelongsTo<typeof Empresa>

  @column()
  declare codigo_perfil: string

  @column()
  declare ativo: boolean

  @hasMany(() => Cupom, { foreignKey: 'promotor_id' })
  declare cupons: HasMany<typeof Cupom>

  @hasMany(() => Lead, { foreignKey: 'promotor_id' })
  declare leads: HasMany<typeof Lead>

  get isPlataforma(): boolean {
    return this.empresa_id === null
  }
}
