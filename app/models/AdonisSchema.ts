import { BaseModel,  column,    } from '@adonisjs/lucid/orm'
import type {    } from '@adonisjs/lucid/types/relations'


export default class AdonisSchema extends BaseModel {
    serializeExtras = true
    public static table="adonis_schema"

    static _adonis_schema_fields_= ['id','name','batch','migration_time']
    //static _produtos_fields_ = ["nome", "descricao", "qr_code"]

    	@column({isPrimary: true})
	 declare id:number


	@column()
	 declare name:string


	@column()
	 declare batch:number


	@column()
	 declare migration_time:Date

}
