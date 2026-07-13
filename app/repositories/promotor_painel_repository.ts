import db from '@adonisjs/lucid/services/db'

const STATUS_FATURADA = 'fechada'

export default class PromotorPainelRepository {
  /** Vendas feitas com os cupões deste promotor, agregadas por loja (empresa). */
  async vendasPorLoja(promotorId: string) {
    return db
      .from('vendas')
      .join('cupom', 'cupom.id', 'vendas.cupom_id')
      .join('empresa', 'empresa.id', 'cupom.empresa_id')
      .where('cupom.promotor_id', promotorId)
      .where('vendas.status', STATUS_FATURADA)
      .groupBy('empresa.id', 'empresa.nome')
      .select('empresa.id as empresa_id', 'empresa.nome as empresa_nome')
      .count('vendas.id as vendas_quantidade')
      .sum('vendas.total as vendas_total')
      .sum('vendas.valor_desconto as valor_desconto_total')
      .orderBy('empresa.nome', 'asc')
  }

  /** Produtos comprados usando os cupões deste promotor, segmentados por loja. */
  async produtosComprados(promotorId: string) {
    return db
      .from('venda_itens')
      .join('vendas', 'vendas.id', 'venda_itens.venda_id')
      .join('cupom', 'cupom.id', 'vendas.cupom_id')
      .join('empresa', 'empresa.id', 'cupom.empresa_id')
      .join('lote_produto', 'lote_produto.id', 'venda_itens.lote_produto_id')
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .where('cupom.promotor_id', promotorId)
      .where('vendas.status', STATUS_FATURADA)
      .groupBy('empresa.id', 'empresa.nome', 'produtos.id', 'produtos.nome')
      .select(
        'empresa.id as empresa_id',
        'empresa.nome as empresa_nome',
        'produtos.id as produto_id',
        'produtos.nome as produto_nome'
      )
      .sum('venda_itens.quantidade as quantidade_total')
      .sum('venda_itens.total as valor_total')
      .orderBy(['empresa.nome', 'produtos.nome'])
  }

  /** Leads (cliques no link de perfil), agregados por loja — null = plataforma em geral. */
  async leadsPorLoja(promotorId: string) {
    return db
      .from('lead')
      .leftJoin('empresa', 'empresa.id', 'lead.empresa_id')
      .where('lead.promotor_id', promotorId)
      .groupBy('empresa.id', 'empresa.nome')
      .select('empresa.id as empresa_id', 'empresa.nome as empresa_nome')
      .count('lead.id as leads_quantidade')
  }

  async leadsTotal(promotorId: string): Promise<number> {
    const resultado = await db.from('lead').where('promotor_id', promotorId).count('* as total').first()
    return Number(resultado?.total ?? 0)
  }
}
