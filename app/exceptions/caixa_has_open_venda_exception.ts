import { Exception } from '@adonisjs/core/exceptions'

export default class CaixaHasOpenVendaException extends Exception {
  static status = 400
  static code = 'CAIXA_HAS_OPEN_VENDA'
  static message = 'Não é possível fechar a caixa: existe pelo menos uma venda aberta associada a ela.'
}
