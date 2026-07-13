import pos from './pos.js'
import users from '../user.js'
import lote from './lote.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { MotivoMovimentacao, TipoMovimentacao } from '#dtos/estoque_dto'
import produtos from './produtos.js'

export default class estoque extends BaseModel {
  static table = 'estoque'

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
  static uuid(model: estoque) {
    model.id ??= randomUUID()
  }

  @column()
  declare lote_produto_id: string

  @belongsTo(() => lote)
  declare lote: BelongsTo<typeof lote>

  @column()
  declare produto_id: string

  @belongsTo(() => produtos, {
    foreignKey: 'produto_id',
  })
  declare produto: BelongsTo<typeof produtos>

  @column()
  declare quantidade: number

  @column()
  declare tipo_movimentacao: TipoMovimentacao

  @column()
  declare motivo: MotivoMovimentacao | string

  @column()
  declare registrado_por: string

  @belongsTo(() => users)
  declare user: BelongsTo<typeof users>

  @column()
  declare pos_id: string

  @belongsTo(() => pos)
  declare pos: BelongsTo<typeof pos>
}
