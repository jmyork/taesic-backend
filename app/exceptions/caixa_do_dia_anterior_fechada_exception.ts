import { Exception } from '@adonisjs/core/exceptions'

/**
 * O utilizador tentou usar uma caixa que tinha ficado aberta de um dia anterior. Essa
 * caixa foi fechada agora (e as vendas que lá ficaram por concluir foram anuladas), por
 * isso o pedido não segue: falta abrir a caixa de hoje.
 *
 * É diferente de `USER_HAS_NO_OPEN_CAIXA` de propósito — quem estava a vender viu uma
 * caixa aberta há um instante e merece saber por que deixou de estar.
 */
export default class CaixaDoDiaAnteriorFechadaException extends Exception {
  static status = 422
  static code = 'CAIXA_DIA_ANTERIOR_FECHADA'
  static message =
    'A caixa que ficou aberta do dia anterior foi fechada e as vendas por concluir foram anuladas. Abra uma caixa nova para registar as vendas de hoje.'
}
