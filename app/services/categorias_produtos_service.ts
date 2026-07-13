import categorias_produtosRepository from '#repositories/categorias_produtos_repository'
import { Createcategorias_produtosDTO } from '#dtos/categorias_produtos_dto'
import { ProdutoCategoriaQueryDTO } from '#dtos/produto_categorias_dto'

export default class categorias_produtosService {
  repo = new categorias_produtosRepository()

  list(page?: number, limit?: number, filter?: ProdutoCategoriaQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: Createcategorias_produtosDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
