import { Exception } from '@adonisjs/core/exceptions'

export default class CaixaIsAlreadyOpenException extends Exception {
  static status = 400
  static code = 'CAIXA_IS_ALREADY_OPEN'
  static message = 'This Caixa is already open'
}
