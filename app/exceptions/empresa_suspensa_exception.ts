import { Exception } from '@adonisjs/core/exceptions'

/**
 * A empresa está suspensa e nenhuma porta lhe abre.
 *
 * 403 e não 404: quem bate à porta é o inquilino, e esconder-lhe que foi
 * suspenso não protege nada — só transforma um corte deliberado num "a
 * aplicação avariou", que acaba num pedido de suporte em vez de num telefonema
 * a resolver a causa. A mensagem não inclui o motivo gravado, esse é para o
 * backoffice e para quem for falar com o cliente.
 */
export default class EmpresaSuspensaException extends Exception {
  static status = 403
  static code = 'EMPRESA_SUSPENSA'
  static message = 'Esta empresa está suspensa. Contacte o suporte da plataforma.'
}
