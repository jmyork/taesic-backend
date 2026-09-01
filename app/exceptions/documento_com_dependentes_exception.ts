import { Exception } from '@adonisjs/core/exceptions'

/**
 * Anular uma factura que já tem recibo ou nota de crédito deixaria esses documentos
 * a apontar para algo que já não produz efeitos — e eles continuariam válidos.
 */
export default class DocumentoComDependentesException extends Exception {
  static status = 409
  static code = 'DOCUMENTO_COM_DEPENDENTES'
  static message = "Este documento tem outros documentos emitidos sobre ele. Anule-os primeiro."
}
