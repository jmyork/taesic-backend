import type { HttpContext } from '@adonisjs/core/http'
import RelatoriosService from '#services/relatorios_service'
import { RelatoriosFiltroValidator } from '#validators/relatorios_validator'

export default class RelatoriosController {
  private service = new RelatoriosService()

  private async handle(
    { request, response, params }: HttpContext,
    mensagem: string,
    executar: (service: RelatoriosService, filtro: any) => Promise<any>
  ) {
    try {
      const qs = await RelatoriosFiltroValidator.validate(request.qs())
      const data = await executar(this.service, { ...qs, company_alias: params.company_alias })
      return response.ok({ data, message: mensagem, status: 200 })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({ data: null, message: 'Dados inválidos', errors: error.messages, status: 400 })
      }
      console.error(`Erro ao calcular "${mensagem}":`, error)
      return response.internalServerError({ data: null, message: 'Erro interno do servidor', status: 500 })
    }
  }

  // ==================== DASHBOARD EXECUTIVO / KPIs ====================
  async dashboardExecutivo(ctx: HttpContext) {
    return this.handle(ctx, 'Dashboard executivo calculado com sucesso', (s, f) => s.dashboardExecutivo(f))
  }

  async kpisGerais(ctx: HttpContext) {
    return this.handle(ctx, 'KPIs gerais calculados com sucesso', (s, f) => s.kpisGerais(f))
  }

  // ==================== FATURAÇÃO / EVOLUÇÃO ====================
  async faturacaoPorPeriodo(ctx: HttpContext) {
    return this.handle(ctx, 'Faturação por período calculada com sucesso', (s, f) => s.faturacaoPorPeriodo(f))
  }

  async evolucaoVendas(ctx: HttpContext) {
    return this.handle(ctx, 'Evolução das vendas calculada com sucesso', (s, f) => s.evolucaoVendas(f))
  }

  // ==================== TOP N ====================
  async topProdutos(ctx: HttpContext) {
    return this.handle(ctx, 'Top produtos calculado com sucesso', (s, f) => s.topProdutos(f))
  }

  async topCategorias(ctx: HttpContext) {
    return this.handle(ctx, 'Top categorias calculado com sucesso', (s, f) => s.topCategorias(f))
  }

  async topClientes(ctx: HttpContext) {
    return this.handle(ctx, 'Top clientes calculado com sucesso', (s, f) => s.topClientes(f))
  }

  async topVendedores(ctx: HttpContext) {
    return this.handle(ctx, 'Top vendedores calculado com sucesso', (s, f) => s.topVendedores(f))
  }

  // ==================== RELATÓRIOS DETALHADOS ====================
  async relatorioVendas(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de vendas calculado com sucesso', (s, f) => s.relatorioVendas(f))
  }

  async relatorioClientes(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de clientes calculado com sucesso', (s, f) => s.relatorioClientes(f))
  }

  async relatorioMetodoPagamento(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório por método de pagamento calculado com sucesso', (s, f) =>
      s.relatorioMetodoPagamento(f)
    )
  }

  async relatorioProdutos(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de produtos calculado com sucesso', (s, f) => s.relatorioProdutos(f))
  }

  async relatorioStock(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de stock calculado com sucesso', (s, f) => s.relatorioStock(f))
  }

  async relatorioCompras(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de compras calculado com sucesso', (s, f) => s.relatorioCompras(f))
  }

  async relatorioLucro(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de lucro calculado com sucesso', (s, f) => s.relatorioLucro(f))
  }

  async relatorioImpostos(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de impostos calculado com sucesso', (s, f) => s.relatorioImpostos(f))
  }

  async relatorioUtilizadores(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de utilizadores calculado com sucesso', (s, f) => s.relatorioUtilizadores(f))
  }

  async relatorioDescontos(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de descontos calculado com sucesso', (s, f) => s.relatorioDescontos(f))
  }

  async relatorioDocumentosAnulados(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de documentos anulados calculado com sucesso', (s, f) =>
      s.relatorioDocumentosAnulados(f)
    )
  }

  async relatorioNotasCredito(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de notas de crédito calculado com sucesso', (s, f) =>
      s.relatorioNotasCredito(f)
    )
  }

  async relatorioRentabilidade(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório de rentabilidade calculado com sucesso', (s, f) => s.relatorioRentabilidade(f))
  }

  async comparativo(ctx: HttpContext) {
    return this.handle(ctx, 'Relatório comparativo calculado com sucesso', (s, f) => s.comparativo(f))
  }

  async fluxoCaixa(ctx: HttpContext) {
    return this.handle(ctx, 'Fluxo de caixa calculado com sucesso', (s, f) => s.fluxoCaixa(f))
  }
}
