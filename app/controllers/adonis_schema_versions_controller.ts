import { HttpContext } from '@adonisjs/core/http'
import AdonisSchemaVersions from "#models/AdonisSchemaVersions";
import { AdonisSchemaVersionsCreateValidator,AdonisSchemaVersionsUpdateValidator } from '#validators/AdonisSchemaVersionsValidator';


export default class AdonisSchemaVersionsController {
  async index({ request,response}: HttpContext) {
    try {
      const data = request.qs()
      let query = AdonisSchemaVersions.query()

      

      if (data.page && data.pageSize) {
        query =  query

          if(AdonisSchemaVersions._adonis_schema_versions_fields_.includes(data.order_field)){
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

        if(AdonisSchemaVersions._adonis_schema_versions_fields_.includes(data.order_field)){
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
      return response.badRequest({message:'Erro ao buscar AdonisSchemaVersions'})
    }
  }

  async store({ request,response }: HttpContext) {
    try {
      const data = await request.validateUsing(AdonisSchemaVersionsCreateValidator)
      const data_result = await AdonisSchemaVersions.create(data)
	
      
      return response.json({message:'AdonisSchemaVersions criado(a) com sucesso', data:data_result})
    } catch (error) {
      console.error(error.messages)
      return response.badRequest({message:error.messages})
    }
  }

  async show({ params,response }: HttpContext) {
    try {
      const data_result = await AdonisSchemaVersions.query().where("",params.id)//await AdonisSchemaVersions.findOrFail(params.id).firstOrFail()
      return response.json({data:data_result})
    } catch (error) {
      console.error(error)
      return response.badRequest({message:'AdonisSchemaVersions não encontrada'})
    }
  }

  async update({ request, params,response }: HttpContext) {
    try {
      const data_result =await AdonisSchemaVersions.query().where("",params.id).firstOrFail()//await AdonisSchemaVersions.findOrFail(params.id)
      const data=await request.validateUsing(AdonisSchemaVersionsUpdateValidator,{meta:{_id:params.id}})
		data_result.merge(data)
	 await data_result.save()
      
      await data_result.save()
      return response.json({message:'AdonisSchemaVersions atualizado(a) com sucesso!',data:data_result})
    } catch (error) {
      console.error(error)
      return response.badRequest({message:'erro ao atualizar AdonisSchemaVersions',error:error.messages})
    }
  }
  async destroy({ params,response}: HttpContext) {
    try {
      const data_result =await AdonisSchemaVersions.query().where("",params.id).firstOrFail()//await AdonisSchemaVersions.findOrFail(params.id)
      await data_result.delete()
      //data_result.estado = data_result.estado == 1 ? 0 : 1
      //const message = data_result.estado
      // ? 'Informação Recuperada Com Sucesso!'
      //  : 'Informação Eliminada Com Sucesso!'
      //await data_result.save()
      return response.json({message:'AdonisSchemaVersions excluido com sucesso!'})
    } catch (error) {
      console.error(error)
        return response.badRequest({message:'Erro ao excluir AdonisSchemaVersions',error:error.messages})
    }
  }
}
