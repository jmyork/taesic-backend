import { Exception } from '@adonisjs/core/exceptions'

export default class SemGestaoDePapeisException extends Exception {
  static status = 409
  static code = 'SEM_GESTAO_DE_PAPEIS'
  static message =
    'A operação deixaria a empresa sem ninguém capaz de gerir papéis, e não haveria como voltar atrás.'
}
