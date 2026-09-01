import { Exception } from '@adonisjs/core/exceptions'

/**
 * Uma venda é titulada por UM documento — factura, factura-recibo, factura genérica
 * ou talão de venda. São alternativas entre si, não cumulativas.
 *
 * Sem esta regra, a mesma operação era declarada às Finanças tantas vezes quantas
 * alguém carregasse no botão. Encontrada na base de desenvolvimento uma venda com
 * OITO documentos a titulá-la.
 *
 * 409 e não 422: o pedido está bem formado; o que está errado é o estado em que a
 * venda já se encontra.
 */
export default class VendaJaFacturadaException extends Exception {
  static status = 409
  static code = 'VENDA_JA_FACTURADA'
  static message = "Esta venda já foi facturada. Anule o documento anterior antes de emitir outro."
}
