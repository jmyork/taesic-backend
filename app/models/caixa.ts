import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import pos from './faturacao/pos.js'
import Empresa from './empresa.js'

export default class caixa extends BaseModel {
  static table = 'caixa'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: caixa) {
    model.id ??= randomUUID()
  }

  @column()
  declare user_id: string


  @belongsTo(() => User, {
    foreignKey: 'user_id',
  })
  declare user: BelongsTo<typeof User>

  @column()
  declare pos_id: string

  @belongsTo(() => pos, {
    foreignKey: 'pos_id',
  })
  declare pos: BelongsTo<typeof pos>

  @column()
  declare data_fecho: DateTime | null
  @column()
  declare valor_inicial: number
  @column()
  declare total_vendas: number
  @column()
  declare status: 'Aberto' | 'Fechado'
  @column()
  declare observacoes: string
  @column()
  declare total_caixa: number

  /** Resolvido via `user.empresa_id` (a cadeia já tratada como autoritativa neste
   * repositório) — null para utilizadores sem empresa (ex.: Platform_Admin). */
  @column()
  declare empresa_id: string | null

  @belongsTo(() => Empresa, {
    foreignKey: 'empresa_id',
  })
  declare empresa: BelongsTo<typeof Empresa>

  /** Número sequencial por empresa (nunca global) — nº do registo, distinto do `id`
   * (UUID). Null quando não há empresa associada. */
  @column()
  declare numero: number | null
}
