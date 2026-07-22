import { Exception } from '@adonisjs/core/exceptions'

export default class VendaPagamentoIncompletoException extends Exception {
  static status = 400
  static code = 'VENDA_PAGAMENTO_INCOMPLETO'

  constructor(totalEsperado: number, totalPago: number) {
    const diferenca = Number((totalEsperado - totalPago).toFixed(2))
    const detalhe =
      diferenca > 0
        ? `faltam ${diferenca} para completar o pagamento`
        : `o valor pago excede o total em ${Math.abs(diferenca)}`

    super(
      `O total pago (${totalPago}) não corresponde ao total da venda (${totalEsperado}) — ${detalhe}.`
    )
  }
}
