import Cliente from './cliente.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Empresa from './empresa.js'

export default class cliente extends BaseModel {
  static table = 'cliente'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: cliente) {
    model.id ??= randomUUID()
  }

  @column()
  declare tipo: string
  @column()
  declare nome: string
  @column()
  declare nome_fantasia: string
  @column()
  declare razao_social: string
  @column()
  declare email: string
  @column()
  declare telefone: string
  @column()
  declare telefone_secundario: string
  @column()
  declare nif: string
  @column()
  declare numero_registro: string
  @column()
  declare data_nascimento: Date
  @column()
  declare genero: string
  @column()
  declare estado_civil: string
  @column()
  declare profissao: string
  @column()
  declare website: string
  @column()
  declare endereco: string
  @column()
  declare bairro: string
  @column()
  declare cidade: string
  @column()
  declare provincia: string
  @column()
  declare pais: string
  @column()
  declare codigo_postal: string
  @column()
  declare ativo: boolean
  @column()
  declare limite_credito: number
  @column()
  declare saldo: number
  @column()
  declare observacao: string
  @column()
  declare logo: string
  @column()
  declare foto: string
  @column()
  declare cliente_pai_id: string
  @belongsTo(() => Cliente, {
    foreignKey: 'cliente_pai_id',
  })
  declare cliente_pai: BelongsTo<typeof Cliente>

  @column()
  declare empresa_id: string | null
  @belongsTo(() => Empresa, {
    foreignKey: 'empresa_id',
  })
  declare empresa: BelongsTo<typeof Empresa>

  /** Número sequencial por empresa (nunca global) — nº do registo, distinto do `id`
   * (UUID) e de `numero_registro` (esse é um número de registo externo, fornecido
   * pelo próprio cliente — ver validators). Null quando não há empresa associada. */
  @column()
  declare numero: number | null
}
