import FacturaRepository from '#repositories/factura_repository'
import {
  AnularFacturaDTO,
  ConfirmarRecebimentoDTO,
  EmitirFacturaDTO,
  FacturaQueryDTO,
  ShowFacturaDTO,
} from '#dtos/factura_dto'

export default class FacturaService {
  private repo = new FacturaRepository()

  list(data: FacturaQueryDTO) {
    return this.repo.paginate(data)
  }

  show(data: ShowFacturaDTO) {
    return this.repo.findOrFail(data)
  }

  emitir(data: EmitirFacturaDTO) {
    return this.repo.emitir(data)
  }

  anular(data: AnularFacturaDTO) {
    return this.repo.anular(data)
  }

  /** O que se pode emitir a seguir a este documento. */
  proximos(data: ShowFacturaDTO) {
    return this.repo.proximos(data)
  }

  /**
   * Todos os documentos da mesma operação — a factura E o recibo, a factura E a
   * nota de crédito. Existe para poderem ser impressos juntos: separados, contam
   * meia história.
   */
  documentosDaOperacao(data: ShowFacturaDTO) {
    return this.repo.documentosDaOperacao(data)
  }

  /** As vendas que este documento cobre — a factura global cobre várias. */
  vendasCobertas(data: ShowFacturaDTO) {
    return this.repo.vendasCobertas(data)
  }

  /** As vendas fechadas que ainda não foram tituladas por nenhum documento. */
  vendasPorFacturar(companyAlias: string, limite?: number) {
    return this.repo.vendasPorFacturar(companyAlias, limite)
  }

  /** O que a empresa tem por receber — a lista, os totais e a antiguidade. */
  contasAReceber(data: { company_alias: string; page?: number; limit?: number }) {
    return this.repo.contasAReceber(data)
  }

  /** Confirmar que o dinheiro entrou — emite o recibo que liquida a factura. */
  confirmarRecebimento(data: ConfirmarRecebimentoDTO) {
    return this.repo.confirmarRecebimento(data)
  }
}
