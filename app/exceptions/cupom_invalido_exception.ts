import { Exception } from '@adonisjs/core/exceptions'

export default class CupomInvalidoException extends Exception {
  static status = 422
  static code = 'CUPOM_INVALIDO'
  static message = 'Cupão inválido, expirado ou não aplicável a esta empresa.'
}
