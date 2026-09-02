import { Exception } from '@adonisjs/core/exceptions'

/**
 * Entregar uma venda que não é um adiantamento.
 *
 * Só o adiantamento tem uma entrega pendente: em todas as outras condições o
 * produto saiu no fecho e a venda já está titulada. Correr a entrega sobre uma
 * dessas daria uma segunda saída de stock do mesmo artigo e um segundo documento
 * a titular a mesma operação.
 */
export default class VendaNaoEAdiantamentoException extends Exception {
  static status = 409
  static code = 'VENDA_NAO_E_ADIANTAMENTO'
  static message = 'Só uma venda por adiantamento tem entrega pendente.'
}
