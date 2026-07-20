import { Exception } from '@adonisjs/core/exceptions'

export default class FailedSendEmailException extends Exception {
  static status = 400
  static code = 'E_SEND_EMAIL_FAILURE'
}
