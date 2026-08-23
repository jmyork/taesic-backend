import { Exception } from '@adonisjs/core/exceptions'

/**
 * Um administrador de plataforma não suspende a empresa a que ele próprio
 * pertence.
 *
 * Mesmo raciocínio de `assertNaoFicaSemGestao` na gestão de papéis: suspender
 * revoga as sessões vivas de todos os utilizadores da empresa — incluindo a
 * dele. Carregar no botão fecharia a porta com a chave lá dentro, e a única
 * saída seria mexer na base de dados à mão.
 */
export default class SuspenderPropriaEmpresaException extends Exception {
  static status = 409
  static code = 'SUSPENDER_PROPRIA_EMPRESA'
  static message =
    'Não pode suspender a empresa a que pertence — ficaria sem acesso e sem forma de reverter.'
}
