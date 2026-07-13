import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import Produtos from './Produtos.js'
import type { HasMany } from '@adonisjs/lucid/types/relations'

export default class ProdutoFormato extends BaseModel {
  public static table = "produto_formatos"
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare nome: string

  @column()
  declare descricao: string

  @hasMany(() => Produtos, {
    foreignKey: "formato_id"
  })
  declare produtos: HasMany<typeof Produtos>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}