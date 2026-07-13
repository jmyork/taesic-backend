import produto_formatos from './produto_formatos.js'
import produto_fabricantes from './produto_fabricantes.js'
import { DateTime } from 'luxon'
import {
  BaseModel,
  column,
  beforeCreate,
  belongsTo,
  hasMany,
  manyToMany,
} from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import marca from './marca.js'
import produto_descricao from './produto_descricao.js'
import produto_categorias from './produto_categorias.js'
import produto_contraindicacoes from './produto_contraindicacoes.js'
import produto_recomendacoes from './produto_recomendacoes.js'
import Empresa from '#models/empresa'
// import categorias_produtos from './categorias_produtos.js'

export default class produtos extends BaseModel {
  static table = 'produtos'

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
  static uuid(model: produtos) {
    model.id ??= randomUUID()
  }

  @column()
  declare nome: string
  @column()
  declare descricao: string

  @column()
  declare is_service: boolean

  @column()
  declare fabricante_id: string | null

  @belongsTo(() => produto_fabricantes, {
    foreignKey: 'fabricante_id',
  })
  declare fabricante: BelongsTo<typeof produto_fabricantes>

  @column()
  declare marca_id: string | null

  @belongsTo(() => marca, {
    foreignKey: 'marca_id',
  })
  declare marca: BelongsTo<typeof marca>

  @belongsTo(() => produto_formatos, {
    foreignKey: 'formato_id',
  })
  declare formato: BelongsTo<typeof produto_formatos>

  @column()
  declare fornecedor_id: string | null

  @column()
  declare formato_id: string | null

  @belongsTo(() => produto_formatos, {
    foreignKey: 'fornecedor_id',
  })
  declare fornecedor: BelongsTo<typeof produto_formatos>

  @hasMany(() => produto_descricao, {
    foreignKey: 'produto_id',
  })
  declare descricoes: HasMany<typeof produto_descricao>

  // @hasMany(() => produto_categorias, {
  //   foreignKey: 'produto_id',
  // })
  // declare categorias: HasMany<typeof produto_categorias>

  @hasMany(() => produto_contraindicacoes, {
    foreignKey: 'produto_id',
  })
  declare contraindicacoes: HasMany<typeof produto_contraindicacoes>

  @hasMany(() => produto_recomendacoes, {
    foreignKey: 'produto_id',
  })
  declare recomendacoes: HasMany<typeof produto_recomendacoes>

  @manyToMany(() => produto_categorias, {
    pivotTable: 'categorias_produtos',
    localKey: 'id',
    pivotForeignKey: 'produto_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'produto_categoria_id',
    pivotTimestamps: true,
  })
  declare categorias: ManyToMany<typeof produto_categorias>

  @column()
  declare empresa_id: string

  @belongsTo(() => Empresa, {
    foreignKey: 'produto_id',
  })
  declare empresa: BelongsTo<typeof Empresa>
}
