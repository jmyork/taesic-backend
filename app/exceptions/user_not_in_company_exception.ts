import { Exception } from '@adonisjs/core/exceptions'

export default class UserNotInCompanyException extends Exception {
  static status = 403
  static code = 'USER_NOT_IN_COMPANY'
  static message = 'O utilizador não pertence a esta empresa.'
}
