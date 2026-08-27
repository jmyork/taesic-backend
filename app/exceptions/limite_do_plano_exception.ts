import { Exception } from '@adonisjs/core/exceptions'

/**
 * O plano da empresa não dá para mais.
 *
 * **402 Payment Required**, e não 403: quem faz o pedido tem permissão para o fazer, e o
 * pedido é legítimo — o que falta é plano. É o único código de estado do HTTP desenhado
 * exactamente para isto, e o frontend distingue-o para mostrar o caminho para o ecrã de
 * subscrição em vez de um "sem autorização" que manda a pessoa falar com o administrador.
 *
 * A mensagem é sempre construída por quem lança (ver `limites_do_plano.ts`): tem de dizer
 * QUE limite bateu e o que ele vale, senão o utilizador fica a saber que não pode e não
 * fica a saber porquê.
 */
export default class LimiteDoPlanoException extends Exception {
  static status = 402
  static code = 'LIMITE_DO_PLANO'
  static message = 'O plano actual não permite esta operação.'
}
