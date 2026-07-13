import { HttpContext } from '@adonisjs/core/http'
import AdonisSchema from "#models/AdonisSchema";
import { AdonisSchemaCreateValidator,AdonisSchemaUpdateValidator } from '#validators/AdonisSchemaValidator';


export default class AdonisSchemaController {
  async index({ request,response}: HttpContext) {
    try {
      const data = request.qs()
      let query = AdonisSchema.query()

      

if(data.name)
	{
	
	query=query.where('name','like','%'+data.name+'%')
	}





      if (data.page && data.pageSize) {
        query =  query

          if(AdonisSchema._adonis_schema_fields_.includes(data.order_field)){
		if (String(data.order_field_order).toLowerCase() === "desc")
		query = query.orderBy(data.order_field, data.order_field_order)
		else if (String(data.order_field_order).toLowerCase() === "asc")
		query = query.orderBy(data.order_field, data.order_field_order)
		else
		query = query.orderBy(data.order_field, "desc")
			}
          
         
        const data_result = await query
          .paginate(data.page, data.pageSize)
          //.orderBy('order_field', 'desc')
          //.paginate(data.page, data.pageSize)
        return response.json({data:data_result})
      } else {
        query =  query

        if(AdonisSchema._adonis_schema_fields_.includes(data.order_field)){
		if (String(data.order_field_order).toLowerCase() === "desc")
		query = query.orderBy(data.order_field, data.order_field_order)
		else if (String(data.order_field_order).toLowerCase() === "asc")
		query = query.orderBy(data.order_field, data.order_field_order)
		else
		query = query.orderBy(data.order_field, "desc")
			}
        const data_result=await query
        return response.json(data_result)
      }
    } catch (error) {
      console.error(error)
      return response.badRequest({message:'Erro ao buscar AdonisSchema'})
    }
  }

  async store({ request,response }: HttpContext) {
    try {
      const data = await request.validateUsing(AdonisSchemaCreateValidator)
      const data_result = await AdonisSchema.create(data)
	
      
      return response.json({message:'AdonisSchema criado(a) com sucesso', data:data_result})
    } catch (error) {
      console.error(error.messages)
      return response.badRequest({message:error.messages})
    }
  }

  async show({ params,response }: HttpContext) {
    try {
      const data_result = await AdonisSchema.query().where("id",params.id)//await AdonisSchema.findOrFail(params.id).firstOrFail()
      return response.json({data:data_result})
    } catch (error) {
      console.error(error)
      return response.badRequest({message:'AdonisSchema não encontrada'})
    }
  }

  async update({ request, params,response }: HttpContext) {
    try {
      const data_result =await AdonisSchema.query().where("id",params.id).firstOrFail()//await AdonisSchema.findOrFail(params.id)
      const data=await request.validateUsing(AdonisSchemaUpdateValidator,{meta:{_id:params.id}})
		data_result.merge(data)
	 await data_result.save()
      
      await data_result.save()
      return response.json({message:'AdonisSchema atualizado(a) com sucesso!',data:data_result})
    } catch (error) {
      console.error(error)
      return response.badRequest({message:'erro ao atualizar AdonisSchema',error:error.messages})
    }
  }
  async destroy({ params,response}: HttpContext) {
    try {
      const data_result =await AdonisSchema.query().where("id",params.id).firstOrFail()//await AdonisSchema.findOrFail(params.id)
      await data_result.delete()
      //data_result.estado = data_result.estado == 1 ? 0 : 1
      //const message = data_result.estado
      // ? 'Informação Recuperada Com Sucesso!'
      //  : 'Informação Eliminada Com Sucesso!'
      //await data_result.save()
      return response.json({message:'AdonisSchema excluido com sucesso!'})
    } catch (error) {
      console.error(error)
        return response.badRequest({message:'Erro ao excluir AdonisSchema',error:error.messages})
    }
  }
}
