import { BaseModel, belongsTo, column, } from '@adonisjs/lucid/orm'
import type { BelongsTo, } from '@adonisjs/lucid/types/relations'
import ProdutoValidade from './ProdutoValidade.js'
import Users from './Users.js'

export default class Estoque extends BaseModel {
	serializeExtras = true
	public static table = "estoque"

	static _estoque_fields_ = ['id', 'produto_validade_id', 'quantidade', 'tipo_movimentacao', 'motivo_retirada', 'data_registro', 'registrado_por']
	//static _produtos_fields_ = ["nome", "descricao", "qr_code"]

	@column({ isPrimary: true })
	declare id: number


	@column()
	declare produto_validade_id: number
	
	@belongsTo(() => ProdutoValidade, { foreignKey: 'produto_validade_id' })

	declare produto_validade_: BelongsTo<typeof ProdutoValidade>


	@column()
	declare quantidade: number


	@column({ isPrimary: true })
	declare tipo_movimentacao: 'entrada' | 'retirada' | 'venda'


	@column()
	declare motivo_retirada: string


	@column()
	declare data_registro: Date


	@column()
	declare registrado_por: number
	@belongsTo(() => Users, { foreignKey: 'registrado_por' })
	declare user_: BelongsTo<typeof Users>

}
