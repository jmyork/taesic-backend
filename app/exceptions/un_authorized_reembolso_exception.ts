import { Exception } from '@adonisjs/core/exceptions'

export default class UnAuthorizedReembolsoException extends Exception {
  static status = 401
  static code = 'UNAUTHORIZED_REEMBOLSO'
  static message = 'Unauthorized: You can only refund your own sales.'
}
