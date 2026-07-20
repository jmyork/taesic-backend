import { Exception } from '@adonisjs/core/exceptions'

export default class ProdutoComMovimentacoesException extends Exception {
  static status = 409
  static code = 'PRODUTO_COM_MOVIMENTACOES'
  static message =
    'Não é permitido alterar um produto para serviço se ele tiver movimentações de estoque associadas.'
}
