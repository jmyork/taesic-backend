import { BaseModel, belongsTo, column,    } from '@adonisjs/lucid/orm'
import type { BelongsTo,   } from '@adonisjs/lucid/types/relations'
import Produtos from './Produtos.js'

export default class ProdutoContraindicacoes extends BaseModel {
    serializeExtras = true
    public static table="produto_contraindicacoes"

    static _produto_contraindicacoes_fields_= ['id','produto_id','contraindicacao']
    //static _produtos_fields_ = ["nome", "descricao", "qr_code"]

    	@column({isPrimary: true})
	 declare id:number


	@column()
	 declare produto_id:number
	@belongsTo(()=>Produtos, {foreignKey: 'produto_id'})
	declare produto_: BelongsTo<typeof Produtos>
	

	@column()
	 declare contraindicacao:string

}
