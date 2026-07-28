import { Exception } from '@adonisjs/core/exceptions'

export default class ServicoIndisponivelException extends Exception {
  static status = 400
  static code = 'SERVICO_INDISPONIVEL'
  static message = 'Este serviço não está disponível para venda de momento.'
}
