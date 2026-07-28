import { Exception } from '@adonisjs/core/exceptions'

export default class UserHasAnOpenVendaException extends Exception {
  static status = 400
  static code = 'USER_HAS_AN_OPEN_VENDA'
  static message = 'User Already has an open venda. Close it and then Open Another one'
}