import { Exception } from '@adonisjs/core/exceptions'

export default class EstoqueInsuficienteException extends Exception {
  static status = 400
  static code = 'ESTOQUE_INSUFICIENTE'

  constructor(disponivel: number, solicitado: number) {
    super(`Estoque insuficiente. Disponível: ${disponivel}, Solicitado: ${solicitado}`)
  }
}
