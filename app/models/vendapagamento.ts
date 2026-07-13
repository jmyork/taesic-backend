import MetodoPagamento from './MetodoPagamento.js'
import Vendas from './Vendas.js'
import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class vendapagamento extends BaseModel{

 static table='vendapagamento'

 @column({isPrimary:true})
 declare id:string

 @column.dateTime({autoCreate:true})
 declare createdAt:DateTime

 @column.dateTime({autoCreate:true,autoUpdate:true})
 declare updatedAt:DateTime

 @column.dateTime()
 declare deletedAt:DateTime|null

 @beforeCreate()
 static uuid(model:vendapagamento){
  model.id ??= randomUUID()
 }

  @column()
  declare venda_id: string
  @belongsTo(() => Vendas, {
          foreignKey: 'venda_id'
        })
  declare venda: BelongsTo<typeof Vendas>
  @column()
  declare metodo_pagamento_id: string
  @belongsTo(() => MetodoPagamento, {
          foreignKey: 'metodo_pagamento_id'
        })
  declare metodo_pagamento: BelongsTo<typeof MetodoPagamento>
  @column()
  declare valor: number
}