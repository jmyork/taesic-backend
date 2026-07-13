import { BaseModel, belongsTo, column,    } from '@adonisjs/lucid/orm'
import type { BelongsTo,   } from '@adonisjs/lucid/types/relations'
import Vendas from './Vendas.js'
import ProdutoValidade from './ProdutoValidade.js'

export default class VendaItens extends BaseModel {
    serializeExtras = true
    public static table="venda_itens"

    static _venda_itens_fields_= ['id','venda_id','produto_validade_id','quantidade','preco_unitario']
    //static _produtos_fields_ = ["nome", "descricao", "qr_code"]

    	@column({isPrimary: true})
	 declare id:number


	@column()
	 declare venda_id:number
	@belongsTo(()=>Vendas, {foreignKey: 'venda_id'})
	declare venda_: BelongsTo<typeof Vendas>
	

	@column()
	 declare produto_validade_id:number
	@belongsTo(()=>ProdutoValidade, {foreignKey: 'produto_validade_id'})
	declare produto_validade_: BelongsTo<typeof ProdutoValidade>
	

	@column()
	 declare quantidade:number


	@column()
	 declare preco_unitario:number

}
