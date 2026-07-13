import { BaseModel, belongsTo, column, hasMany, } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, } from '@adonisjs/lucid/types/relations'
import Produtos from './Produtos.js'
import Estoque from './Estoque.js'
import VendaItens from './VendaItens.js'

export default class ProdutoValidade extends BaseModel {
	serializeExtras = true
	public static table = "produto_validade"

	static _produto_validade_fields_ = ['id', "preco_venda", 'produto_id', 'data_validade', 'quantidade_em_estoque']
	//static _produtos_fields_ = ["nome", "descricao", "qr_code"]

	@column({ isPrimary: true })
	declare id: number

	@column()
	declare produto_id: number
	@belongsTo(() => Produtos, { foreignKey: 'produto_id' })
	declare produto_: BelongsTo<typeof Produtos>

	@column()
	declare preco_venda: number

	@column()
	declare preco_compra: number

	@column()
	declare data_fabrico: Date

	@column()
	declare data_validade: Date

	@column()
	declare quantidade_em_estoque: number


	@hasMany(() => Estoque, { foreignKey: 'produto_validade_id' })
	declare estoque_: HasMany<typeof Estoque>


	@hasMany(() => VendaItens, { foreignKey: 'produto_validade_id' })
	declare venda_itens_: HasMany<typeof VendaItens>

}
