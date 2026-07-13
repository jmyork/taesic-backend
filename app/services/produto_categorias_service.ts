import produto_categoriasRepository from '#repositories/produto_categorias_repository'
import {
  Createproduto_categoriasDTO,
  ProdutoCategoriaQueryDTO,
  Updateproduto_categoriasDTO,
} from '#dtos/produto_categorias_dto'

export default class produto_categoriasService {
  repo = new produto_categoriasRepository()

  list(page?: number, limit?: number, filter?: ProdutoCategoriaQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: Createproduto_categoriasDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: Updateproduto_categoriasDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
