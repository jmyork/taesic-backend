import { Exception } from '@adonisjs/core/exceptions'

export default class NotAllowedChangeIsServiceTagException extends Exception {
  static status = 500
  static code = 'NOT_ALLOWED_CHANGE_IS_SERVICE_TAG'
  static message = 'Is not allowed to change the is_service tag of a product that has related records in other tables.'
}