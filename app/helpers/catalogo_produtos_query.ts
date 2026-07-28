import produtos from '#models/faturacao/produtos'
import { CatalogoProdutosFilterDTO } from '#dtos/catalogo_produtos_dto'
import { applyRange } from './query_filters.js'

/**
 * Query partilhada pelo catálogo público, cross-tenant (`catalogo_publico_repository.ts`)
 * e pelo catálogo do domínio (`produtos_repository.catalogo()`). A única diferença entre
 * os dois é se `companyAlias` é passado ou não — quem decide isso é sempre o repositório
 * chamador, nunca esta função.
 *
 * Um produto só aparece se tiver pelo menos um lote não-apagado (mesmo critério que o
 * catálogo público já usava) — isto inclui serviços, que têm sempre um lote com
 * `quantidade_em_estoque = 0` (`produtos_repository.create()`).
 *
 * Devolve produtos com TODAS as características (descrições, contraindicações,
 * recomendações, categorias, marca, fabricante, formato, fornecedor, medias, lotes) via
 * `.preload()`, mais o stock total e o intervalo de preços agregados a partir dos lotes.
 */
function buildCatalogoProdutosQuery(filter?: CatalogoProdutosFilterDTO, companyAlias?: string) {
  let query = produtos
    .query()
    .join('empresa', 'empresa.id', 'produtos.empresa_id')
    .join('lote_produto', (join) => {
      join.on('lote_produto.produto_id', 'produtos.id').andOnNull('lote_produto.deleted_at')
    })
    .whereNull('produtos.deleted_at')

  if (companyAlias) {
    query = query.where('empresa.company_alias', companyAlias)
  }

  if (filter?.q) {
    query = query
      .leftJoin('produto_descricao', (join) => {
        join
          .on('produto_descricao.produto_id', 'produtos.id')
          .andOnNull('produto_descricao.deleted_at')
      })
      .where((sub) => {
        sub
          .where('produtos.nome', 'like', `%${filter.q}%`)
          .orWhere('produtos.descricao', 'like', `%${filter.q}%`)
          .orWhere('produto_descricao.propriedade', 'like', `%${filter.q}%`)
          .orWhere('produto_descricao.descricao_detalhada', 'like', `%${filter.q}%`)
      })
  }

  if (filter?.marca_id) query = query.where('produtos.marca_id', filter.marca_id)
  if (filter?.formato_id) query = query.where('produtos.formato_id', filter.formato_id)
  if (filter?.fabricante_id) query = query.where('produtos.fabricante_id', filter.fabricante_id)
  if (filter?.fornecedor_id) query = query.where('produtos.fornecedor_id', filter.fornecedor_id)
  if (filter?.is_service !== undefined) query = query.where('produtos.is_service', filter.is_service)
  if (filter?.disponivel !== undefined) query = query.where('produtos.disponivel', filter.disponivel)

  if (filter?.produto_categoria_id) {
    query = query
      .join('categorias_produtos', 'categorias_produtos.produto_id', 'produtos.id')
      .where('categorias_produtos.produto_categoria_id', filter.produto_categoria_id)
  }

  if (filter?.pos_id) {
    query = query.join('estoque', 'estoque.produto_id', 'produtos.id').where('estoque.pos_id', filter.pos_id)
  }

  applyRange(query, 'lote_produto.preco_compra', filter?.preco_compra_start, filter?.preco_compra_end)
  applyRange(query, 'lote_produto.preco_venda', filter?.preco_venda_start, filter?.preco_venda_end)

  return query
    .groupBy(
      'produtos.id',
      'produtos.nome',
      'produtos.descricao',
      'produtos.is_service',
      'produtos.disponivel',
      'produtos.marca_id',
      'produtos.formato_id',
      'produtos.fabricante_id',
      'produtos.fornecedor_id',
      'produtos.empresa_id'
    )
    // Só as colunas de negócio de `produtos` — sem enabled/created_at/updated_at/deleted_at.
    // marca_id/formato_id/fabricante_id/fornecedor_id/empresa_id ficam porque são as FKs de
    // que os `.preload()` abaixo precisam para resolver cada relação belongsTo.
    .select(
      'produtos.id',
      'produtos.nome',
      'produtos.descricao',
      'produtos.is_service',
      'produtos.disponivel',
      'produtos.marca_id',
      'produtos.formato_id',
      'produtos.fabricante_id',
      'produtos.fornecedor_id',
      'produtos.empresa_id'
    )
    .sum('lote_produto.quantidade_em_estoque as quantidade_em_estoque')
    .min('lote_produto.preco_venda as preco_venda_min')
    .max('lote_produto.preco_venda as preco_venda_max')
    .min('lote_produto.preco_compra as preco_compra_min')
    .max('lote_produto.preco_compra as preco_compra_max')
    // Cada preload traz só os campos de negócio da relação — nunca enabled/created_at/
    // updated_at/deleted_at nem FKs redundantes (ex.: o empresa_id de dentro de marca/
    // fabricante/etc., já implícito por pertencerem ao mesmo produto).
    .preload('descricoes', (q) => q.select('id', 'propriedade', 'descricao_detalhada'))
    .preload('contraindicacoes', (q) => q.select('id', 'contraindicacao'))
    .preload('recomendacoes', (q) => q.select('id', 'recomendacao'))
    .preload('categorias', (q) => q.select('id', 'nome', 'descricao'))
    .preload('marca', (q) => q.select('id', 'nome', 'descricao'))
    .preload('fabricante', (q) => q.select('id', 'nome', 'email', 'telefone', 'endereco'))
    .preload('formato', (q) => q.select('id', 'nome', 'descricao'))
    .preload('fornecedor', (q) => q.select('id', 'nome', 'email', 'telefone', 'endereco'))
    .preload('empresa', (q) => q.select('id', 'nome', 'company_alias'))
    .preload('medias', (q) => q.select('id', 'media'))
    .preload('lotes', (q) =>
      q
        .whereNull('deleted_at')
        .select('id', 'lote', 'data_validade', 'data_fabrico', 'quantidade_em_estoque', 'preco_venda', 'preco_compra')
    )
    .orderBy('produtos.nome', 'asc')
}

/**
 * Pagina o catálogo e achata os agregados (`quantidade_em_estoque`, `preco_venda_min/max`,
 * `preco_compra_min/max`) para o nível de topo de cada produto serializado — por omissão,
 * Lucid só serializa `$extras` (o que uma query com `.sum()/.min()/.max()` produz) se
 * `serializeExtras` estiver definido; sem isto, os agregados desapareciam silenciosamente
 * do JSON de resposta (nunca lançava erro, só faltavam os campos).
 */
export async function paginateCatalogoProdutos(
  page: number,
  limit: number,
  filter?: CatalogoProdutosFilterDTO,
  companyAlias?: string
) {
  const paginator = await buildCatalogoProdutosQuery(filter, companyAlias).paginate(page, limit)

  for (const produto of paginator.all()) {
    ;(produto as any).serializeExtras = () => produto.$extras
  }

  return paginator
}
