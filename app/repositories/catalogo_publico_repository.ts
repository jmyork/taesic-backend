import { CatalogoProdutosFilterDTO } from '#dtos/catalogo_produtos_dto'
import { paginateCatalogoProdutos } from '../helpers/catalogo_produtos_query.js'

export default class CatalogoPublicoRepository {
  /** Catálogo público, cross-tenant — deliberadamente SEM filtro de company_alias (é o único
   * sítio da app onde isto é intencional: mostra produtos de TODAS as empresas clientes). */
  async paginateProdutos(page = 1, limit = 20, filter?: CatalogoProdutosFilterDTO) {
    return paginateCatalogoProdutos(page, limit, filter)
  }
}
