import { BaseModel,  column,    } from '@adonisjs/lucid/orm'
import type {    } from '@adonisjs/lucid/types/relations'


export default class AdonisSchemaVersions extends BaseModel {
    serializeExtras = true
    public static table="adonis_schema_versions"

    static _adonis_schema_versions_fields_= ['version']
    //static _produtos_fields_ = ["nome", "descricao", "qr_code"]

    	@column()
	 declare version:number

}
