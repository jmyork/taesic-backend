import { Exception } from '@adonisjs/core/exceptions'

export default class VendaNaoFechadaException extends Exception {
  static status = 422
  static code = 'VENDA_NAO_FECHADA'
  static message = 'Só é possível emitir factura para uma venda fechada.'
}
