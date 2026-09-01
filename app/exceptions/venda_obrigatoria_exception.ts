import { Exception } from '@adonisjs/core/exceptions'

/**
 * Há tipos de documento que só se emitem a partir de uma venda — factura,
 * factura-recibo, talão de venda. Quais, está em `exigeVenda`, na tabela de
 * `app/helpers/tipos_de_documento.ts`.
 *
 * O validator já recusa o pedido sem `venda_id` (regra 7.20: a obrigatoriedade
 * impõe-se lá). Isto é a segunda defesa, para quem chame o repositório
 * directamente — sem ela, o `undefined` chega ao `.where()` do Lucid e sai um 500
 * que não diz que campo falta.
 */
export default class VendaObrigatoriaException extends Exception {
  static status = 422
  static code = 'VENDA_OBRIGATORIA'
  static message = 'Indique a venda a partir da qual este documento é emitido.'
}
