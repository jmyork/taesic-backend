import { BaseCommand, flags } from '@adonisjs/core/ace'
import MinfinService from '../servicos/minfin_service.js'

/**
 * A rotina que fecha o ciclo da facturação electrónica.
 *
 * ── Porque é que isto tem de existir ──────────────────────────────────────────
 *
 * `registarFactura` é assíncrono: devolve um `requestID` e o veredicto vem
 * depois, de quem PERGUNTAR. A AGT não avisa ninguém — não há callback, não há
 * webhook, não há nada no Blueprint que aponte para o nosso lado.
 *
 * Sem esta varredura, cada submissão fica "aceite" para sempre e ninguém sabe se
 * as facturas passaram. Não é um relatório em falta: é a diferença entre ter
 * facturado e ter facturado validamente.
 *
 * ── Como correr ───────────────────────────────────────────────────────────────
 *
 *     node ace minfin:sincronizar
 *     node ace minfin:sincronizar --limite=200
 *     node ace minfin:sincronizar --simular
 *
 * Por cron externo, como `estoque:check-alertas` e `empresa:clean:expired`. De
 * cinco em cinco minutos é um ponto de partida razoável: quem decide o ritmo
 * real é a coluna `proxima_consulta_em` de cada submissão (recuo exponencial até
 * uma hora, ver `minfin_repository.proximaTentativa`), e esta varredura só toca
 * nas que já estão vencidas. Correr mais vezes não faz mais chamadas à AGT.
 *
 * ⚠️ Este comando é CROSS-TENANT de propósito — percorre as submissões de todas
 * as empresas. É o oposto do resto do módulo, e é a razão de ser um comando e
 * não uma rota.
 */
export default class SincronizarMinfin extends BaseCommand {
  static commandName = 'minfin:sincronizar'
  static description =
    'Pergunta à AGT o veredicto das facturas electrónicas submetidas e ainda sem resposta'

  static options = { startApp: true }

  @flags.number({
    description: 'Quantas submissões consultar nesta passagem',
    default: 50,
  })
  declare limite: number

  @flags.boolean({
    description: 'Mostra o que seria consultado, sem chamar a AGT',
    default: false,
  })
  declare simular: boolean

  async run() {
    const service = new MinfinService()

    if (this.simular) {
      // `--simular` lê a mesma lista que a execução a sério consumiria, e não
      // uma aproximação dela — senão o ensaio não diz nada sobre o que vai
      // acontecer.
      const pendentes = await service.pendentesDeVeredicto(this.limite)

      if (pendentes.length === 0) {
        this.logger.info('Nenhuma submissão à espera de veredicto.')
        return
      }

      this.logger.info(`${pendentes.length} submissão(ões) seriam consultadas:`)
      for (const s of pendentes) {
        this.logger.info(
          `  ${s.id}  requestID=${s.request_id}  documentos=${s.numero_documentos}  tentativas=${s.tentativas_estado}`
        )
      }
      return
    }

    const { consultadas, concluidas, falhas } = await service.sincronizarPendentes(this.limite)

    if (consultadas === 0 && falhas.length === 0) {
      this.logger.info('Nenhuma submissão à espera de veredicto.')
      return
    }

    this.logger.success(
      `${consultadas} submissão(ões) consultada(s); ${concluidas} com veredicto final.`
    )

    /*
     * As falhas são listadas e o comando sai com erro — mas só DEPOIS de ter
     * tratado todas as outras. Um contribuinte sem credenciais configuradas
     * (ver `repositorios/credenciais.ts`) não pode impedir que as submissões
     * dos restantes sejam consultadas, e um cron que não distinga "correu tudo"
     * de "correu metade" não serve para vigiar nada.
     */
    if (falhas.length > 0) {
      this.logger.error(`${falhas.length} submissão(ões) não puderam ser consultadas:`)
      for (const falha of falhas) {
        this.logger.error(`  ${falha.submissao_id}: ${falha.motivo}`)
      }
      this.exitCode = 1
    }
  }
}
