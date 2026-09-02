import { Exception } from '@adonisjs/core/exceptions'

/**
 * Uma factura global titula as operações DE UM PERÍODO. Uma venda de Março não
 * pertence a uma global de Janeiro — e sem esta verificação o documento declarava
 * um período e cobria outro, com o total a não bater com nada.
 *
 * 422 e não 409: o pedido está mal formado (a lista não corresponde ao período
 * declarado), e corrige-se mudando a escolha, não o estado do sistema.
 */
export default class VendaForaDoPeriodoException extends Exception {
  static status = 422
  static code = 'VENDA_FORA_DO_PERIODO'
  static message =
    'Há vendas escolhidas fora do período indicado. Ajuste o período ou a lista de vendas.'
}
