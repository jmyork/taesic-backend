import { Exception } from '@adonisjs/core/exceptions'

/**
 * Ajustar ou reembolsar uma venda que nenhum documento titula.
 *
 * A nota de débito e a nota de crédito rectificam um documento — a AGT recusa uma
 * nota de crédito sem referência à origem (E13), e uma nota que não diga o que
 * rectifica não rectifica nada. Sem factura, não há o que corrigir.
 *
 * Acontece nas vendas anteriores à emissão automática no fecho, que ficaram por
 * titular. O caminho é emitir primeiro o documento da venda.
 */
export default class VendaSemDocumentoException extends Exception {
  static status = 409
  static code = 'VENDA_SEM_DOCUMENTO'
  static message =
    'Esta venda ainda não tem factura emitida. Emita a factura da venda antes de a corrigir.'
}
