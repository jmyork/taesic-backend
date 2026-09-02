import { Exception } from '@adonisjs/core/exceptions'

/**
 * Pagamentos registados numa venda a crédito.
 *
 * A crédito é «não recebe nada agora». Aceitar aqui uma entrada parcial daria uma
 * factura pelo total a conviver com dinheiro já em caixa, e o mapa de cobranças
 * passaria a reclamar valor que já entrou.
 *
 * Quem recebe parte no acto e o resto depois faz duas coisas distintas: uma venda
 * a pronto pagamento pelo que entregou, ou um adiantamento pelo que recebeu.
 */
export default class VendaACreditoComPagamentoException extends Exception {
  static status = 400
  static code = 'VENDA_A_CREDITO_COM_PAGAMENTO'
  static message =
    'Uma venda a prazo não leva pagamentos no acto. Retire os pagamentos registados ou mude a condição de pagamento.'
}
