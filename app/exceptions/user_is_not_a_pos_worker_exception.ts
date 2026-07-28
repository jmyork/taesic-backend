import { Exception } from '@adonisjs/core/exceptions'

export default class UserIsNotAPosWorkerException extends Exception {
  static status = 400
  static code = 'USER_IS_NOT_A_POS_WORKER'
  static message = 'User Is Not One Of This POS Worker'
}