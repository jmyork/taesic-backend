import { BaseCommand, flags } from '@adonisjs/core/ace'
import AvisoCobrancaRepository from '#repositories/aviso_cobranca_repository'

/**
 * Emite os avisos de cobrança devidos hoje.
 *
 * ── Quando é que um aviso é devido ──────────────────────────────────────────
 *
 * Dois momentos, por decisão do dono do produto: **sete dias antes** do
 * vencimento (a cortesia — quem se esqueceu ainda vai a tempo) e **no dia limite**
 * (a cobrança). A regra vive em `app/helpers/prazo_de_pagamento.ts`; este comando
 * só a corre.
 *
 * ── Correr uma vez por dia, via cron externo ────────────────────────────────
 *
 * Mesmo padrão de `estoque:check-alertas` e `caixa:fechar-diario`. Nenhum destes
 * está agendado no servidor — é trabalho de operação, e a lição de §7.27 é que
 * enquanto não estiver, o que depende dele não acontece.
 *
 * É seguro correr várias vezes no mesmo dia: um aviso que já saiu não volta a
 * sair. O que decide isso não é uma coluna, são os avisos já gravados — ver
 * `AvisoCobrancaRepository`.
 *
 * ── Uma factura que falhe não pára as outras ────────────────────────────────
 *
 * O comando corre sobre a plataforma inteira. As falhas são listadas no fim e o
 * comando sai com código 1 se houve alguma, para um agendamento poder acusar —
 * mas os avisos que passaram ficam emitidos.
 */
export default class AvisoCobrancaEmitir extends BaseCommand {
  static commandName = 'aviso-cobranca:emitir'
  static description =
    'Emite os avisos de cobrança devidos hoje (7 dias antes do vencimento e no dia limite)'
  static options = { startApp: true }

  @flags.string({
    description: 'Limitar a uma empresa (company_alias). Sem isto, corre para todas.',
  })
  declare empresa?: string

  async run() {
    const resultado = await new AvisoCobrancaRepository().emitirDevidos({
      company_alias: this.empresa,
    })

    this.logger.info(`${resultado.candidatas} factura(s) em dívida analisada(s).`)

    if (resultado.emitidos.length === 0) {
      this.logger.info('Nenhum aviso de cobrança devido hoje.')
    } else {
      for (const aviso of resultado.emitidos) {
        const rotulo = aviso.momento === 'pre_aviso' ? 'pré-aviso' : 'vencimento'
        this.logger.success(
          `${aviso.aviso_referencia} (${rotulo}) sobre ${aviso.referencia}`
        )
      }
      this.logger.success(`${resultado.emitidos.length} aviso(s) emitido(s).`)
    }

    if (resultado.falhas.length > 0) {
      for (const falha of resultado.falhas) {
        this.logger.error(`Factura ${falha.factura_id}: ${falha.erro}`)
      }
      this.logger.error(`${resultado.falhas.length} factura(s) não puderam ser avisadas.`)
      this.exitCode = 1
    }
  }
}
