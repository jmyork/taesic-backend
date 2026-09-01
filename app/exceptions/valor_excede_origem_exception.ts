import { Exception } from '@adonisjs/core/exceptions'

/**
 * Uma nota de crédito não pode creditar mais do que foi facturado, somadas as notas
 * anteriores. Creditar a mais é devolver imposto que nunca foi liquidado.
 */
export default class ValorExcedeOrigemException extends Exception {
  static status = 422
  static code = 'VALOR_EXCEDE_ORIGEM'
  static message = "O valor indicado é superior ao que resta do documento de origem."
}
