import produto_formatosRepository from '#repositories/produto_formatos_repository'
import {
  Createproduto_formatosDTO,
  ProdutoFormatoQueryDTO,
  Updateproduto_formatosDTO,
} from '#dtos/produto_formatos_dto'

export default class produto_formatosService {
  repo = new produto_formatosRepository()

  list(page?: number, limit?: number, filter?: ProdutoFormatoQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: Createproduto_formatosDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: Updateproduto_formatosDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
