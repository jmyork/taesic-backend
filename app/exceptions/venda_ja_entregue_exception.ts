import { Exception } from '@adonisjs/core/exceptions'

/** A entrega de um adiantamento já foi registada — o stock já saiu uma vez. */
export default class VendaJaEntregueException extends Exception {
  static status = 409
  static code = 'VENDA_JA_ENTREGUE'
  static message = 'Esta venda já foi entregue.'
}
