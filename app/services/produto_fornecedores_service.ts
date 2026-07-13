import produto_fornecedoresRepository from '#repositories/produto_fornecedores_repository'
import {
  Createproduto_fornecedoresDTO,
  ProdutoFornecedorQueryDTO,
  Updateproduto_fornecedoresDTO,
} from '#dtos/produto_fornecedores_dto'

export default class produto_fornecedoresService {
  repo = new produto_fornecedoresRepository()

  list(page?: number, limit?: number, filter?: ProdutoFornecedorQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: Createproduto_fornecedoresDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: Updateproduto_fornecedoresDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
