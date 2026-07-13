import { Exception } from '@adonisjs/core/exceptions'

export default class FacturaJaAnuladaException extends Exception {
  static status = 422
  static code = 'FACTURA_JA_ANULADA'
  static message = 'Esta factura já está anulada.'
}
