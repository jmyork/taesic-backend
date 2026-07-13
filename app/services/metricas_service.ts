import MetricasRepository from '#repositories/metricas_repository'
import { MetricasPeriodoDTO, MetricasResumoDTO } from '#dtos/metricas_dto'

export default class MetricasService {
  private repo = new MetricasRepository()

  resumo(data: MetricasResumoDTO) {
    return this.repo.resumo(data)
  }

  porPosto(data: MetricasPeriodoDTO) {
    return this.repo.porPosto(data)
  }

  porVendedor(data: MetricasPeriodoDTO) {
    return this.repo.porVendedor(data)
  }

  porDia(data: MetricasPeriodoDTO) {
    return this.repo.porDia(data)
  }

  promotoresResumo(data: MetricasPeriodoDTO) {
    return this.repo.promotoresResumo(data)
  }

  promotoresPorPromotor(data: MetricasPeriodoDTO) {
    return this.repo.promotoresPorPromotor(data)
  }

  promotoresPorProduto(data: MetricasPeriodoDTO) {
    return this.repo.promotoresPorProduto(data)
  }
}
