import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Empresa from '#models/empresa'
import pos from './pos.js'
import User from '#models/user'

export default class despesas extends BaseModel {
  static table = 'despesas'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: despesas) {
    model.id ??= randomUUID()
  }

  @column()
  declare empresa_id: string

  @belongsTo(() => Empresa, { foreignKey: 'empresa_id' })
  declare empresa: BelongsTo<typeof Empresa>

  @column()
  declare pos_id: string | null

  @belongsTo(() => pos, { foreignKey: 'pos_id' })
  declare pos: BelongsTo<typeof pos>

  @column()
  declare categoria: string

  @column()
  declare descricao: string | null

  @column()
  declare valor: number

  @column()
  declare data_despesa: Date

  @column()
  declare registrado_por: string

  @belongsTo(() => User, { foreignKey: 'registrado_por' })
  declare user: BelongsTo<typeof User>

  /** Número sequencial por empresa (nunca global) — nº do registo, distinto do `id`
   * (UUID). Atribuído em despesas_repository.create() via proximoNumeroPorEmpresa(). */
  @column()
  declare numero: number
}
