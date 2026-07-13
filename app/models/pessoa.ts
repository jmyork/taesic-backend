import User from './user.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Empresa from './empresa.ts'

export default class pessoa extends BaseModel {
  static table = 'pessoa'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeCreate()
  static uuid(model: pessoa) {
    model.id ??= randomUUID()
  }

  @column()
  declare nome: string

  @column()
  declare sobrenome:string

  @column()
  declare email: string

  @column()
  declare telefone: string

  @column()
  declare nif: string

  @column()
  declare data_nascimento: Date

  @column()
  declare genero: string

  @column()
  declare endereco: string

  @column()
  declare cidade: string

  @column()
  declare pais: string

  @column()
  declare ativo: boolean

  @column()
  declare tipo: 'Cliente' | 'Funcionario'| 'Promotor'


 @column()
 declare img_url: string

  @column()
  declare user_id: string

  @belongsTo(() => User, {
    foreignKey: 'user_id',
  })
  declare user: BelongsTo<typeof User>

  @column()
  declare empresa_id: string

  @belongsTo(()=>Empresa,{
    foreignKey:"empresa_id"
  })
  declare empresa: BelongsTo<typeof Empresa>
}
