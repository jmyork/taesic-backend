import { Exception } from '@adonisjs/core/exceptions'

/**
 * Um recibo sobre um documento que já inclui o pagamento — factura-recibo, talão de
 * venda — ou que já tem recibo emitido seria receber duas vezes no papel.
 */
export default class DocumentoJaPagoException extends Exception {
  static status = 409
  static code = 'DOCUMENTO_JA_PAGO'
  static message = "Este documento já está pago. Não é possível emitir outro recibo sobre ele."
}
