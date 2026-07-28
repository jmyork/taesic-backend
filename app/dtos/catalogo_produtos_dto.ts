/**
 * Filtros partilhados pelo catálogo público (cross-tenant) e pelo catálogo do domínio —
 * a única diferença entre os dois é se a query é escopada por `company_alias` ou não
 * (decidido pelo repositório chamador, nunca por este DTO).
 */
export interface CatalogoProdutosFilterDTO {
  /** Pesquisa em produtos.nome, produtos.descricao e nas descrições detalhadas do produto. */
  q?: string

  marca_id?: string
  formato_id?: string
  fabricante_id?: string
  fornecedor_id?: string
  produto_categoria_id?: string
  is_service?: boolean
  disponivel?: boolean

  /** Só produtos com pelo menos uma movimentação de estoque registada neste POS. */
  pos_id?: string
  /** Idem, mas por nome do POS (parcial) em vez do id exacto. */
  pos_nome?: string

  preco_compra_start?: number
  preco_compra_end?: number
  preco_venda_start?: number
  preco_venda_end?: number

  page?: number
  limit?: number
}
