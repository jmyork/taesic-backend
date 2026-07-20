import { Exception } from '@adonisjs/core/exceptions'

export default class ProdutoMediaLimiteExcedidoException extends Exception {
  static status = 400
  static code = 'PRODUTO_MEDIA_LIMITE_EXCEDIDO'

  constructor(disponivel: number) {
    super(
      `O limite de imagens por produto será excedido. Restam apenas ${disponivel} ${disponivel === 1 ? 'imagem disponível' : 'imagens disponíveis'} para inserir.`
    )
  }
}
