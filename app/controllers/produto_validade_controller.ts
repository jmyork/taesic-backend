import { HttpContext } from '@adonisjs/core/http'
import ProdutoValidade from "#models/ProdutoValidade";
import { ProdutoValidadeCreateValidator, ProdutoValidadeUpdateValidator } from '#validators/ProdutoValidadeValidator';


export default class ProdutoValidadeController {
  async index({ request, response }: HttpContext) {
    try {
      const data = request.qs()
      let query = ProdutoValidade.query()









      if (data.page && data.pageSize) {
        query = query.preload("produto_")
          .preload("estoque_")
          .preload("venda_itens_")


        if (ProdutoValidade._produto_validade_fields_.includes(data.order_field)) {
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
        return response.json({ data: data_result })
      } else {
        query = query.preload("produto_")
          .preload("estoque_")
          .preload("venda_itens_")
          


        if (ProdutoValidade._produto_validade_fields_.includes(data.order_field)) {
          if (String(data.order_field_order).toLowerCase() === "desc")
            query = query.orderBy(data.order_field, data.order_field_order)
          else if (String(data.order_field_order).toLowerCase() === "asc")
            query = query.orderBy(data.order_field, data.order_field_order)
          else
            query = query.orderBy(data.order_field, "desc")
        }
        const data_result = await query
        return response.json(data_result)
      }
    } catch (error) {
      console.error(error)
      return response.badRequest({ message: 'Erro ao buscar ProdutoValidade' })
    }
  }

  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(ProdutoValidadeCreateValidator)
      const data_result = await ProdutoValidade.create(data)


      return response.json({ message: 'ProdutoValidade criado(a) com sucesso', data: data_result })
    } catch (error) {
      console.error(error)
      return response.badRequest({ message: error.messages })
    }
  }

  async show({ params, response }: HttpContext) {
    try {
      const data_result = await ProdutoValidade.query().where("id", params.id)//await ProdutoValidade.findOrFail(params.id).preload("produto_")
        .preload("estoque_")
        .preload("venda_itens_")
        .firstOrFail()
      return response.json({ data: data_result })
    } catch (error) {
      console.error(error)
      return response.badRequest({ message: 'ProdutoValidade não encontrada' })
    }
  }

  async update({ request, params, response }: HttpContext) {
    try {
      const data_result = await ProdutoValidade.query().where("id", params.id).firstOrFail()//await ProdutoValidade.findOrFail(params.id)
      const data = await request.validateUsing(ProdutoValidadeUpdateValidator, { meta: { _id: params.id } })
      data_result.merge(data)
      await data_result.save()

      await data_result.save()
      return response.json({ message: 'ProdutoValidade atualizado(a) com sucesso!', data: data_result })
    } catch (error) {
      console.error(error)
      return response.badRequest({ message: 'erro ao atualizar ProdutoValidade', error: error.messages })
    }
  }
  async destroy({ params, response }: HttpContext) {
    try {
      const data_result = await ProdutoValidade.query().where("id", params.id).firstOrFail()//await ProdutoValidade.findOrFail(params.id)
      await data_result.delete()
      //data_result.estado = data_result.estado == 1 ? 0 : 1
      //const message = data_result.estado
      // ? 'Informação Recuperada Com Sucesso!'
      //  : 'Informação Eliminada Com Sucesso!'
      //await data_result.save()
      return response.json({ message: 'ProdutoValidade excluido com sucesso!' })
    } catch (error) {
      console.error(error)
      return response.badRequest({ message: 'Erro ao excluir ProdutoValidade', error: error.messages })
    }
  }
}
