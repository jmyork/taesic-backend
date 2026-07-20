import { Exception } from '@adonisjs/core/exceptions'

export default class TipoMovimentacaoInvalidoException extends Exception {
  static status = 400
  static code = 'TIPO_MOVIMENTACAO_INVALIDO'

  constructor(tipo: string, tiposValidos: string[]) {
    super(
      `Tipo de movimentação inválido: "${tipo}". Use um dos valores com direção explícita (${tiposValidos.join(', ')}).`
    )
  }
}
