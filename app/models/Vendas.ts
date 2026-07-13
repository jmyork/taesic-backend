import { BaseModel, belongsTo, column, hasMany, } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, } from '@adonisjs/lucid/types/relations'
import Users from './Users.js'
import VendaItens from './VendaItens.js'

export default class Vendas extends BaseModel {
	serializeExtras = true
	public static table = "vendas"

	static _vendas_fields_ = ['id', 'vendedor_id', 'data_venda', 'total', 'fechado']
	//static _produtos_fields_ = ["nome", "descricao", "qr_code"]

	@column({ isPrimary: true })
	declare id: number

	@column()
	declare vendedor_id: number

	@belongsTo(() => Users, { foreignKey: 'vendedor_id', localKey: 'id' })
	declare user_: BelongsTo<typeof Users>


	@column()
	declare data_venda: Date


	@column()
	declare total: number


	@column()
	declare fechado: boolean


	@hasMany(() => VendaItens, { foreignKey: 'venda_id',localKey:'id' })
	declare venda_itens_: HasMany<typeof VendaItens>

}
