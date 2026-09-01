import { Exception } from '@adonisjs/core/exceptions'

/**
 * Um documento que não nasce de uma venda tem de trazer o seu valor.
 *
 * Nos tipos que exigem venda o total vem de lá e não se pergunta. Nos que não —
 * recibo, nota de crédito, factura de adiantamento, factura global — não há de
 * onde o tirar, e assumir zero emitiria um documento fiscal sem valor.
 */
export default class ValorDoDocumentoEmFaltaException extends Exception {
  static status = 422
  static code = 'VALOR_DO_DOCUMENTO_EM_FALTA'
  static message = 'Indique o valor do documento. Este tipo não é emitido a partir de uma venda.'
}
