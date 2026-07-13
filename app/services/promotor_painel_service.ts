import PromotorPainelRepository from '#repositories/promotor_painel_repository'

export default class PromotorPainelService {
  repo = new PromotorPainelRepository()

  async resumo(promotorId: string) {
    const [vendasPorLoja, leadsPorLoja, leadsTotal] = await Promise.all([
      this.repo.vendasPorLoja(promotorId),
      this.repo.leadsPorLoja(promotorId),
      this.repo.leadsTotal(promotorId),
    ])
    return { vendas_por_loja: vendasPorLoja, leads_por_loja: leadsPorLoja, leads_total: leadsTotal }
  }

  produtos(promotorId: string) {
    return this.repo.produtosComprados(promotorId)
  }
}
