import { BaseCommand } from '@adonisjs/core/ace'
import FechoDiarioRepository from '#repositories/fecho_diario_repository'

/**
 * Fecho automático das caixas ao fim do dia.
 *
 * Correr por cron externo às 23:59, como os outros trabalhos periódicos deste projecto
 * (`empresa:clean:expired`, `estoque:check-alertas`):
 *
 *   59 23 * * *  cd /caminho/para/taesic-backend && node ace caixa:fechar-diario
 *
 * Fecha todas as caixas que ficarem abertas e ANULA as vendas dessas caixas que não
 * chegaram a ser fechadas — sem isso, a caixa não pode sequer fechar (o backend recusa
 * fechar uma caixa com venda aberta) e o dia seguinte começa a somar sobre os totais do
 * dia anterior.
 */
export default class CaixaFecharDiario extends BaseCommand {
  static commandName = 'caixa:fechar-diario'
  static description =
    'Fecha as caixas que ficaram abertas e anula as vendas por fechar dessas caixas'
  static options = { startApp: true }

  async run() {
    const resumo = await new FechoDiarioRepository().fecharCaixasAbertas()

    if (resumo.caixasFechadas === 0) {
      this.logger.info('Nenhuma caixa aberta — nada a fechar.')
      return
    }

    this.logger.success(
      `${resumo.caixasFechadas} caixa(s) fechada(s); ${resumo.vendasAnuladas} venda(s) por fechar anulada(s).`
    )
  }
}
