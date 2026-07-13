import Empresa from './empresa.js'
import User from './user.js'
import Promotor from './promotor.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class cupom extends BaseModel {
  static table = 'cupom'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: cupom) {
    model.id ??= randomUUID()
  }

  // Legado: nunca chegou a ser usado por nenhuma funcionalidade em produção. Cupões pertencem
  // a um promotor (ver `promotor_id`), não a um `user` com login — mantido apenas para não
  // partir a coluna existente, não é lido/escrito pelo fluxo atual.
  @column()
  declare user_id: string
  @belongsTo(() => User, { foreignKey: 'user_id' })
  declare user: BelongsTo<typeof User>

  @column()
  declare desconto: number

  @column.dateTime()
  declare validade: DateTime | null

  @column()
  declare empresa_id: string
  @belongsTo(() => Empresa, { foreignKey: 'empresa_id' })
  declare empresa: BelongsTo<typeof Empresa>

  /** O código partilhável/redimível numa venda. */
  @column()
  declare codigo: string

  @column()
  declare promotor_id: string
  @belongsTo(() => Promotor, { foreignKey: 'promotor_id' })
  declare promotor: BelongsTo<typeof Promotor>

  get expirado(): boolean {
    return this.validade !== null && this.validade < DateTime.now()
  }
}
