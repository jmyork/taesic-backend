import { HttpContext } from '@adonisjs/core/http'
import ProdutoImagens from "#models/ProdutoImagens";
import { ProdutoImagensCreateValidator, ProdutoImagensUpdateValidator } from '#validators/ProdutoImagensValidator';


export default class ProdutoImagensController {
  async index({ request, response }: HttpContext) {
    try {
      const data = request.qs()
      let query = ProdutoImagens.query()

      if (data.page && data.pageSize) {
        query = query.preload("produto_")
        if (ProdutoImagens._produto_imagens_fields_.includes(data.order_field)) {
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


        if (ProdutoImagens._produto_imagens_fields_.includes(data.order_field)) {
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
      return response.badRequest({ message: 'Erro ao buscar ProdutoImagens' })
    }
  }

  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(ProdutoImagensCreateValidator)
      const imagem_url = request.file('imagem_url')
      
      if (!imagem_url) {
        return response.badRequest({ message: 'Imagem é obrigatória' })
      }

      const fileName = `${new Date().getTime()}.${imagem_url.extname}`
      await imagem_url.move('public/uploads', { name: fileName })

      if (!imagem_url.isValid) {
        return response.badRequest({ 
          message: 'Formato inválido para imagem_url', 
          alloweds: imagem_url.allowedExtensions 
        })
      }

      const data_result = await ProdutoImagens.create({ 
        ...data, 
        imagem_url: fileName 
      })

      return response.json({ message: 'ProdutoImagens criado(a) com sucesso', data: data_result })
    } catch (error) {
      console.error(error)
      return response.badRequest({ message: error.messages || error.message || 'Erro ao salvar imagem' })
    }
  }

  async show({ params, response }: HttpContext) {
    try {
      const data_result = await ProdutoImagens.query().where("id", params.id)//await ProdutoImagens.findOrFail(params.id).preload("produto_")
        .firstOrFail()
      return response.json({ data: data_result })
    } catch (error) {
      console.error(error)
      return response.badRequest({ message: 'ProdutoImagens não encontrada' })
    }
  }

  async update({ request, params, response }: HttpContext) {
    try {
      const data_result = await ProdutoImagens.query().where("id", params.id).firstOrFail()//await ProdutoImagens.findOrFail(params.id)
      const imagem_url = request.file('imagem_url')
      await imagem_url?.move('tmp', { name: (new Date()).getTime().toString() + '.' + imagem_url?.extname })
      if (!imagem_url?.isValid) return response.badRequest({ message: 'Invalid Format For imagem_url', alloweds: imagem_url?.allowedExtensions })
      const data = await request.validateUsing(ProdutoImagensUpdateValidator, { meta: { _id: params.id } })
      data_result.merge({ ...data, imagem_url: imagem_url?.fileName + '.' + imagem_url?.extname, })


      await data_result.save()
      return response.json({ message: 'ProdutoImagens atualizado(a) com sucesso!', data: data_result })
    } catch (error) {
      console.error(error)
      return response.badRequest({ message: 'erro ao atualizar ProdutoImagens', error: error.messages })
    }
  }
  async destroy({ params, response }: HttpContext) {
    try {
      const data_result = await ProdutoImagens.query().where("id", params.id).firstOrFail()//await ProdutoImagens.findOrFail(params.id)
      await data_result.delete()
      //data_result.estado = data_result.estado == 1 ? 0 : 1
      //const message = data_result.estado
      // ? 'Informação Recuperada Com Sucesso!'
      //  : 'Informação Eliminada Com Sucesso!'
      //await data_result.save()
      return response.json({ message: 'ProdutoImagens excluido com sucesso!' })
    } catch (error) {
      console.error(error)
      return response.badRequest({ message: 'Erro ao excluir ProdutoImagens', error: error.messages })
    }
  }
}
