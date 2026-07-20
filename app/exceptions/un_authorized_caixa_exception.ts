import { Exception } from '@adonisjs/core/exceptions'

export default class UnAuthorizedCaixaException extends Exception {
  static status = 401
  static code = 'UNAUTHORIZED_CAIXA'
  static message = 'Unauthorized: You can only close your own Caixa.'
}
