import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import taxa_iva from './taxa_iva.js'

export default class Empresa extends BaseModel {
  static table = 'empresa'

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
  static uuid(model: Empresa) {
    model.id ??= randomUUID()
  }

  @column()
  declare user_id: string

  @column()
  declare nome: string

  @column()
  declare nif: string

  @column()
  declare tamanho: "pequena"|"media"|"grande"

  @column()
  declare status: boolean

  @column()
  declare inadiplente: boolean

  @column()
  declare regime_iva: boolean

  /** Só relevante quando `regime_iva` — decide a taxa usada no cálculo de "IVA
   * liquidado" nos relatórios (`relatorios_repository.ts`). */
  @column()
  declare taxa_iva_id: string | null

  @belongsTo(() => taxa_iva, { foreignKey: 'taxa_iva_id' })
  declare taxaIva: BelongsTo<typeof taxa_iva>

  @column()
  declare company_alias: string

  @column()
  declare localizacao: string

  @column()
  declare contacto: string

  @column()
  declare verified: boolean
}
