import lote from './lote.js'
import vendas from './vendas.js'
import { DateTime } from 'luxon'
import {
  BaseModel,
  column,
  beforeCreate,
  belongsTo,
} from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo, } from '@adonisjs/lucid/types/relations'

export default class venda_itens extends BaseModel {
  static table = 'venda_itens'

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
  static uuid(model: venda_itens) {
    model.id ??= randomUUID()
  }

  @column()
  declare venda_id: string

  @belongsTo(() => vendas)
  declare venda: BelongsTo<typeof vendas>

  @column()
  declare lote_produto_id: string



  @belongsTo(() => lote, {
    foreignKey: 'lote_produto_id',
  })
  declare lote: BelongsTo<typeof lote>

  @column()
  declare quantidade: number

  @column()
  declare preco_unitario: number

  @column()
  declare desconto: number

  @column()
  declare total: number

  @column()
  declare quantidade_reembolsada: number
}
