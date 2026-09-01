import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import factura from './factura.js'
import vendas from './vendas.js'

/**
 * Uma venda coberta por um documento que cobre várias — hoje, a factura global.
 *
 * Ver o cabeçalho da migração `create_factura_venda_table` para o porquê de isto
 * ser uma tabela e não uma consulta por cliente e período: o que uma factura
 * global cobre fica congelado no momento da emissão, senão uma venda lançada
 * depois mudava os artigos de um documento já entregue ao cliente.
 */
export default class facturaVenda extends BaseModel {
  static table = 'factura_venda'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeCreate()
  static uuid(model: facturaVenda) {
    model.id ??= randomUUID()
  }

  @column()
  declare factura_id: string

  @belongsTo(() => factura, { foreignKey: 'factura_id' })
  declare factura: BelongsTo<typeof factura>

  @column()
  declare venda_id: string

  @belongsTo(() => vendas, { foreignKey: 'venda_id' })
  declare venda: BelongsTo<typeof vendas>
}
