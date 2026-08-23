import { Exception } from '@adonisjs/core/exceptions'

export default class PapelNomeReservadoException extends Exception {
  static status = 422
  static code = 'PAPEL_NOME_RESERVADO'
  static message =
    'O prefixo "Platform_" está reservado aos papéis da plataforma. Escolha outro nome.'
}
