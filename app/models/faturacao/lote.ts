import produtos from './produtos.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class lote extends BaseModel {
  static table = 'lote_produto'

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
  static uuid(model: lote) {
    model.id ??= randomUUID()
  }

  @beforeCreate()
  static async generateLote(model: lote) {
    // evita query desnecessária
    if (model.lote) {
      return
    }

    if (!model.produto_id) {
      return
    }

    const produto = await produtos.findOrFail(model.produto_id)

    // serviço não gera lote
    if (produto.is_service) {
      return
    }

    const hoje = DateTime.now().toFormat('yyyyMMdd')
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()

    model.lote = `${hoje}-${random}`
  }

  @column()
  declare produto_id: string

  @belongsTo(() => produtos, {
    foreignKey: 'produto_id',
  })
  declare produto: BelongsTo<typeof produtos>

  @column()
  declare data_validade: Date

  @column()
  declare data_fabrico: Date

  @column()
  declare quantidade_em_estoque: number

  @column()
  declare preco_venda: number

  @column()
  declare preco_compra: number

  @column()
  declare lote: string
}
