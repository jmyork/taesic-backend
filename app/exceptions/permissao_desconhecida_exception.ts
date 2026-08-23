import { Exception } from '@adonisjs/core/exceptions'

/**
 * Um nome de permissão que não existe no catálogo, ou que não é de domínio.
 *
 * Não é ignorado em silêncio de propósito: aceitar o pedido e guardar só as
 * permissões reconhecidas diria a quem gere que o papel ficou com um acesso que
 * na verdade não tem — e um ecrã de permissões que mente é pior do que um erro.
 */
export default class PermissaoDesconhecidaException extends Exception {
  static status = 422
  static code = 'PERMISSAO_DESCONHECIDA'
  static message = 'Permissões inexistentes ou fora do âmbito de empresa.'
}
