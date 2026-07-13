import { Exception } from '@adonisjs/core/exceptions'

export default class PromotorEmpresaMismatchException extends Exception {
  static status = 422
  static code = 'PROMOTOR_EMPRESA_MISMATCH'
  static message = 'Este promotor pertence a outra empresa e não pode receber cupões aqui.'
}
