import { Exception } from '@adonisjs/core/exceptions'

export default class VendaSemPagamentoException extends Exception {
  static status = 400
  static code = 'VENDA_SEM_PAGAMENTO'

  constructor() {
    super('Não é possível fechar a venda sem indicar pelo menos um método de pagamento e o respectivo valor.')
  }
}
