import { Exception } from '@adonisjs/core/exceptions'

export default class ProdutoMediaLimiteAtingidoException extends Exception {
  static status = 400
  static code = 'PRODUTO_MEDIA_LIMITE_ATINGIDO'

  constructor(limite: number) {
    super(`O limite de ${limite} imagens por produto já foi atingido. Remova alguma imagem antes de adicionar novas.`)
  }
}
