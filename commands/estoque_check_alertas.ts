import { BaseCommand } from '@adonisjs/core/ace'
import LoteRepository from '#repositories/lote_repository'

/**
 * Verificação periódica (correr via cron externo, ex.: `node ace estoque:check-alertas`
 * uma vez por dia — mesmo padrão de agendamento que `empresa:clean:expired`) de lotes com
 * stock > 0 perto de (ou já passados de) validade. Emite `LoteValidadeProxima` para cada
 * um, que o listener em `app/listeners/estoque_alertas.ts` transforma num email para
 * `ALERT_EMAIL`.
 */
export default class EstoqueCheckAlertas extends BaseCommand {
  static commandName = 'estoque:check-alertas'
  static description = 'Verifica lotes perto da validade e emite alertas (LoteValidadeProxima)'
  static options = { startApp: true }

  async run() {
    const total = await new LoteRepository().avisarLotesProximosValidade()

    if (total === 0) {
      this.logger.info('Nenhum lote perto da validade.')
    } else {
      this.logger.success(`${total} lote(s) perto da validade — alertas emitidos.`)
    }
  }
}
