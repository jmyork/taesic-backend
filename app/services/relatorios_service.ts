import RelatoriosRepository from '#repositories/relatorios_repository'
import { RelatoriosFilterDTO } from '#dtos/relatorios_dto'

export default class RelatoriosService {
  private repo = new RelatoriosRepository()

  dashboardExecutivo(data: RelatoriosFilterDTO) {
    return this.repo.dashboardExecutivo(data)
  }

  kpisGerais(data: RelatoriosFilterDTO) {
    return this.repo.kpisGerais(data)
  }

  faturacaoPorPeriodo(data: RelatoriosFilterDTO) {
    return this.repo.faturacaoPorPeriodo(data)
  }

  evolucaoVendas(data: RelatoriosFilterDTO) {
    return this.repo.evolucaoVendas(data)
  }

  topProdutos(data: RelatoriosFilterDTO) {
    return this.repo.topProdutos(data)
  }

  topCategorias(data: RelatoriosFilterDTO) {
    return this.repo.topCategorias(data)
  }

  topClientes(data: RelatoriosFilterDTO) {
    return this.repo.topClientes(data)
  }

  topVendedores(data: RelatoriosFilterDTO) {
    return this.repo.topVendedores(data)
  }

  relatorioVendas(data: RelatoriosFilterDTO) {
    return this.repo.relatorioVendas(data)
  }

  relatorioClientes(data: RelatoriosFilterDTO) {
    return this.repo.relatorioClientes(data)
  }

  relatorioMetodoPagamento(data: RelatoriosFilterDTO) {
    return this.repo.relatorioMetodoPagamento(data)
  }

  relatorioProdutos(data: RelatoriosFilterDTO) {
    return this.repo.relatorioProdutos(data)
  }

  relatorioStock(data: RelatoriosFilterDTO) {
    return this.repo.relatorioStock(data)
  }

  relatorioCompras(data: RelatoriosFilterDTO) {
    return this.repo.relatorioCompras(data)
  }

  relatorioLucro(data: RelatoriosFilterDTO) {
    return this.repo.relatorioLucro(data)
  }

  relatorioImpostos(data: RelatoriosFilterDTO) {
    return this.repo.relatorioImpostos(data)
  }

  relatorioUtilizadores(data: RelatoriosFilterDTO) {
    return this.repo.relatorioUtilizadores(data)
  }

  relatorioDescontos(data: RelatoriosFilterDTO) {
    return this.repo.relatorioDescontos(data)
  }

  relatorioDocumentosAnulados(data: RelatoriosFilterDTO) {
    return this.repo.relatorioDocumentosAnulados(data)
  }

  relatorioNotasCredito(data: RelatoriosFilterDTO) {
    return this.repo.relatorioNotasCredito(data)
  }

  relatorioRentabilidade(data: RelatoriosFilterDTO) {
    return this.repo.relatorioRentabilidade(data)
  }

  comparativo(data: RelatoriosFilterDTO) {
    return this.repo.comparativo(data)
  }

  fluxoCaixa(data: RelatoriosFilterDTO) {
    return this.repo.fluxoCaixa(data)
  }
}
