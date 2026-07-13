import produto_categorias from './produto_categorias.js'
import produtos from './produtos.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class categorias_produtos extends BaseModel {
  static table = 'categorias_produtos'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: categorias_produtos) {
    model.id ??= randomUUID()
  }

  @column()
  declare produto_id: string

  @belongsTo(() => produtos, {
    foreignKey: 'produto_id',
  })
  declare produto: BelongsTo<typeof produtos>

  @column()
  declare produto_categoria_id: string

  @belongsTo(() => produto_categorias, {
    foreignKey: 'produto_categoria_id',
  })
  declare produto_categoria: BelongsTo<typeof produto_categorias>
}
