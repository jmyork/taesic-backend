import { Exception } from '@adonisjs/core/exceptions'

/**
 * Corrigir ou remover um pagamento só é possível enquanto a venda está `'aberta'`.
 *
 * Depois de fechada, o valor pago já entrou nos totais da caixa
 * (`caixa_repository.recalcularTotais`, chamado por `vendas_repository.close()`) e foi
 * validado contra o total da venda — mexer nele a seguir deixaria a caixa a dizer um
 * número que já não corresponde a nenhum pagamento registado, sem nada a assinalar.
 * Um valor errado numa venda já fechada corrige-se por reembolso/anulação, não editando
 * o histórico.
 */
export default class PagamentoVendaNaoAbertaException extends Exception {
  static status = 400
  static code = 'PAGAMENTO_VENDA_NAO_ABERTA'

  constructor(estado?: string) {
    super(
      `Só é possível corrigir ou remover um pagamento enquanto a venda está aberta` +
        (estado ? ` (esta está "${estado}").` : '.') +
        ' Numa venda já fechada, use o reembolso ou a anulação.'
    )
  }
}
