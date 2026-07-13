import { Exception } from '@adonisjs/core/exceptions'

export default class UserHasNoOpenCaixaException extends Exception {
  static status = 422
  static code = 'USER_HAS_NO_OPEN_CAIXA'
  static message = 'User has no an open  caixa. Open a caixa before creating a venda.'
}