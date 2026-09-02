import { Exception } from '@adonisjs/core/exceptions'

/**
 * Uma venda a crédito ou por adiantamento sem adquirente identificado por NIF.
 *
 * Não é burocracia. A crédito, a dívida fica sem devedor: não há a quem dirigir o
 * aviso de cobrança nem em nome de quem emitir a factura. No adiantamento, há uma
 * entrega por fazer e tem de se saber a quem.
 *
 * A venda a pronto pagamento continua a não exigir nada — sem NIF sai uma factura
 * genérica, que é o documento desenhado exactamente para isso.
 */
export default class VendaSemClienteIdentificadoException extends Exception {
  static status = 400
  static code = 'VENDA_SEM_CLIENTE_IDENTIFICADO'
  static message =
    'Indique o cliente e o NIF antes de concluir. Uma venda a prazo ou por adiantamento tem de dizer a quem se destina.'
}
