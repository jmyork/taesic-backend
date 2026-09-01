import { Exception } from '@adonisjs/core/exceptions'

/**
 * O período de uma factura global (art.º 8.º do Decreto Presidencial 71/25):
 * a periodicidade é, no máximo, mensal.
 */
export default class PeriodoDeFacturacaoInvalidoException extends Exception {
  static status = 422
  static code = 'PERIODO_DE_FACTURACAO_INVALIDO'
  static message =
    'O período da factura global tem de começar antes de terminar e não pode exceder um mês.'
}
