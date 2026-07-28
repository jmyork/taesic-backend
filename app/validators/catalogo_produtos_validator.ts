import vine from '@vinejs/vine'

/**
 * Filtros do catálogo de produtos (partilhados pelo endpoint público e pelo de domínio —
 * ver `app/helpers/catalogo_produtos_query.ts`). Isolamento por tenant nunca vem daqui:
 * o público não tem `company_alias` nenhum; o de domínio usa `params.company_alias` da
 * rota, tal como todos os outros `*QueryValidator` deste projecto.
 */
export const CatalogoProdutosQueryValidator = vine.create(
  vine.object({
    q: vine.string().trim().escape().optional(),

    marca_id: vine.string().trim().uuid().optional(),
    formato_id: vine.string().trim().uuid().optional(),
    fabricante_id: vine.string().trim().uuid().optional(),
    fornecedor_id: vine.string().trim().uuid().optional(),
    produto_categoria_id: vine.string().trim().uuid().optional(),
    is_service: vine.boolean().optional(),
    disponivel: vine.boolean().optional(),
    pos_id: vine.string().trim().uuid().optional(),

    preco_compra_start: vine.number().decimal([0, 12]).optional(),
    preco_compra_end: vine.number().decimal([0, 12]).optional(),
    preco_venda_start: vine.number().decimal([0, 12]).optional(),
    preco_venda_end: vine.number().decimal([0, 12]).optional(),

    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
