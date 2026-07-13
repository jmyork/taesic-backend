import users from '#models/user'
import { DateTime } from 'luxon'
import {
  BaseModel,
  column,
  beforeCreate,
  belongsTo,
  hasMany,
  // beforeSave,
} from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import venda_itens from './venda_itens.js'
import cliente from '#models/cliente'
import cupom from '#models/cupom'
// import db from '@adonisjs/lucid/services/db'

export default class vendas extends BaseModel {
  static table = 'vendas'

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
  static uuid(model: vendas) {
    model.id ??= randomUUID()
  }

  @column()
  declare total: number

  @column()
  declare status: 'aberta' | 'fechada' | 'cancelada' | 'reembolsada'

  @hasMany(() => venda_itens, {
    foreignKey: 'venda_id',
  })
  declare itens: HasMany<typeof venda_itens>

  @column()
  declare caixa_id: string | null

  @column()
  declare venda_tipo: 'presencial' | 'online' | 'online_loja'

  @column()
  declare cliente_online_id: string | null

  @belongsTo(() => users, {
    foreignKey: 'cliente_online_id',
  })
  declare cliente_online: BelongsTo<typeof users>

  @column()
  declare cliente_presencial_id: string | null

  @belongsTo(() => cliente, {
    foreignKey: 'cliente_presencial_id',
  })
  declare cliente_presencial: BelongsTo<typeof cliente>

  @column()
  declare cupom_id: string | null

  @belongsTo(() => cupom, {
    foreignKey: 'cupom_id',
  })
  declare cupom: BelongsTo<typeof cupom>

  @column()
  declare valor_desconto: number
}
