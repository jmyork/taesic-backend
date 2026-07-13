import { BaseModel, belongsTo, column, hasMany, } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, } from '@adonisjs/lucid/types/relations'
import ProdutoContraindicacoes from './ProdutoContraindicacoes.js'
import ProdutoDescricao from './ProdutoDescricao.js'
import ProdutoImagens from './ProdutoImagens.js'
import ProdutoRecomendacoes from './ProdutoRecomendacoes.js'
import ProdutoValidade from './ProdutoValidade.js'
import ProdutoFormato from './produto_formato.js'
import ProdutoFabricante from './produto_fabricante.js'

export default class Produtos extends BaseModel {
	serializeExtras = true
	public static table = "produtos"

	static _produtos_fields_ = ['id', 'nome', 'descricao', 'preco', 'qr_code']
	//static _produtos_fields_ = ["nome", "descricao", "qr_code"]

	@column({ isPrimary: true })
	declare id: number


	@column()
	declare nome: string


	@column()
	declare descricao: string


	@column()
	declare preco: number

	@column()
	declare formato_id: number

	@belongsTo(() => ProdutoFormato, {
		foreignKey: "formato_id"
	})
	declare formato: BelongsTo<typeof ProdutoFormato>

	@column()
	declare fabricante_id: number

	@belongsTo(() => ProdutoFabricante, {
		foreignKey: "fabricante_id"
	})
	declare fabricante: BelongsTo<typeof ProdutoFabricante>

	@hasMany(() => ProdutoContraindicacoes, { foreignKey: 'produto_id' })
	declare produto_contraindicacoes_: HasMany<typeof ProdutoContraindicacoes>


	@hasMany(() => ProdutoDescricao, { foreignKey: 'produto_id' })
	declare produto_descricao_: HasMany<typeof ProdutoDescricao>


	@hasMany(() => ProdutoImagens, { foreignKey: 'produto_id' })
	declare produto_imagens_: HasMany<typeof ProdutoImagens>


	@hasMany(() => ProdutoRecomendacoes, { foreignKey: 'produto_id' })
	declare produto_recomendacoes_: HasMany<typeof ProdutoRecomendacoes>


	@hasMany(() => ProdutoValidade, { foreignKey: 'produto_id' })
	declare produto_validade_: HasMany<typeof ProdutoValidade>

}
