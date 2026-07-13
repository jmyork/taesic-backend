import { Exception } from '@adonisjs/core/exceptions'

export default class CannotAssignPlatformRoleException extends Exception {
  static status = 403
  static code = 'CANNOT_ASSIGN_PLATFORM_ROLE'
  static message = 'Um administrador de empresa não pode atribuir papéis de plataforma.'
}
