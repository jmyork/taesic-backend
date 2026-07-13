import db from '@adonisjs/lucid/services/db'

export default class CatalogoPublicoRepository {
  /** Catálogo público, cross-tenant — deliberadamente SEM filtro de company_alias (é o único
   * sítio da app onde isto é intencional: mostra produtos de TODAS as empresas clientes). */
  async paginateProdutos(page = 1, limit = 20, search?: string) {
    let query = db
      .from('produtos')
      .join('empresa', 'empresa.id', 'produtos.empresa_id')
      .join('lote_produto', 'lote_produto.produto_id', 'produtos.id')
      .whereNull('produtos.deleted_at')
      .whereNull('lote_produto.deleted_at')

    if (search) {
      query = query.where('produtos.nome', 'like', `%${search}%`)
    }

    return query
      .groupBy('produtos.id', 'produtos.nome', 'produtos.descricao', 'empresa.id', 'empresa.nome')
      .select(
        'produtos.id as produto_id',
        'produtos.nome as produto_nome',
        'produtos.descricao as produto_descricao',
        'empresa.id as empresa_id',
        'empresa.nome as empresa_nome'
      )
      .min('lote_produto.preco_venda as preco_a_partir_de')
      .orderBy('produtos.nome', 'asc')
      .paginate(page, limit)
  }
}
