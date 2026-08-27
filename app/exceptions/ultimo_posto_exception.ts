import { Exception } from '@adonisjs/core/exceptions'

/**
 * Recusa desactivar o último posto de atendimento de uma empresa.
 *
 * Uma empresa sem posto não abre caixa, não vende e não recebe stock — e quem lá ficasse
 * não teria como voltar atrás sozinho (criar postos é permissão de Admin, e um Vendedor
 * fica preso no ecrã de escolher PDV). Ver `app/helpers/posto_padrao.ts`.
 *
 * 409 e não 403: o pedido é legítimo e quem o faz tem permissão para o fazer — é o estado
 * actual da empresa que o impede.
 */
export default class UltimoPostoException extends Exception {
  static status = 409
  static code = 'ULTIMO_POSTO'
  static message =
    'A empresa tem de ter sempre um posto de atendimento activo. Crie outro posto antes de desactivar este.'
}
