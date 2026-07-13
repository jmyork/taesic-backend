import { DateTime } from 'luxon'
import { BaseModel,column,beforeCreate } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'

export default class empresa_conta_bancaria extends BaseModel{

 static table='empresa_conta_bancaria'

 @column({isPrimary:true})
 declare id:string

 @column.dateTime({autoCreate:true})
 declare createdAt:DateTime

 @column.dateTime({autoCreate:true,autoUpdate:true})
 declare updatedAt:DateTime

 @column.dateTime()
 declare deletedAt:DateTime|null

 @beforeCreate()
 static uuid(model:empresa_conta_bancaria){
  model.id ??= randomUUID()
 }

  @column()
  declare empresa_id@relations.Empresa: string
  @column()
  declare conta: string
  @column()
  declare iban: string
}