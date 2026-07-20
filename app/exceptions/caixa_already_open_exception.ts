import { Exception } from '@adonisjs/core/exceptions'

export default class CaixaAlreadyOpenException extends Exception {
  static status = 400
  static code = 'CAIXA_ALREADY_OPEN'
  static message =
    'A Caixa is already open for this user. Please close the existing Caixa before opening a new one.'
}
