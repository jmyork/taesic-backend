import { Exception } from '@adonisjs/core/exceptions'

/**
 * O documento de origem tem de ser indicado, existir, pertencer à MESMA empresa e
 * não estar anulado.
 *
 * Cobre os dois casos — não indicado e indicado mas inválido — porque para quem
 * emite são o mesmo problema: falta dizer o que este documento rectifica ou
 * liquida. Uma nota de crédito sem essa referência é recusada pela AGT com E13.
 *
 * A verificação da empresa não é uma formalidade: sem ela, uma nota de crédito
 * podia rectificar a factura de outro contribuinte — e passaria, porque o id é
 * um UUID que não diz de quem é. É a mesma fronteira que a auditoria da secção
 * 7.24 impôs às restantes chaves estrangeiras.
 */
export default class DocumentoDeOrigemInvalidoException extends Exception {
  static status = 422
  static code = 'DOCUMENTO_DE_ORIGEM_INVALIDO'
  static message =
    'Indique um documento de origem válido — o documento que este rectifica ou liquida.'
}
