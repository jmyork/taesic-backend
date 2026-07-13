import { Exception } from '@adonisjs/core/exceptions'

export default class VendaIsAlreadyOpenOrCloseException extends Exception {
  static status = 400
  static code = 'VENDA_ALREADY_OPEN_OR_CLOSE'
  static message = 'Venda is already closed'
}