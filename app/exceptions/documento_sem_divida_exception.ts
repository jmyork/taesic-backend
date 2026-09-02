import { Exception } from '@adonisjs/core/exceptions'

/**
 * Um recibo ou um aviso de cobrança sobre um documento que não está em dívida.
 *
 * Substituiu, na prática, metade do que `DocumentoJaPagoException` cobria. A
 * diferença entre as duas está no motivo, e o utilizador precisa de a ler: aqui o
 * documento **nunca** foi uma dívida — foi pago no acto, ou não é do género que
 * se cobra —, enquanto `DOCUMENTO_JA_PAGO` é uma dívida que já foi liquidada.
 *
 * Uma mensagem só para os dois casos mandava investigar o recibo que não existe.
 */
export default class DocumentoSemDividaException extends Exception {
  static status = 409
  static code = 'DOCUMENTO_SEM_DIVIDA'
  static message =
    'Este documento não tem valor por receber — foi pago no momento da emissão. Só uma factura a prazo se liquida com recibo.'
}
