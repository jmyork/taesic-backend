import produtosRepository from '#repositories/produtos_repository'
import {
  CreateprodutosDTO,
  UpdateprodutosDTO,
  CreateProdutoDetalhesDTO,
  ProdutoQueryDTO,
} from '#dtos/produtos_dto'

export default class produtosService {
  repo = new produtosRepository()

  list(page?: number, limit?: number, filter?: ProdutoQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: CreateprodutosDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdateprodutosDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }

  registrarProdutoAndDetalhes(data: CreateProdutoDetalhesDTO) {
    return this.repo.registrarProdutoAndDetalhes(data)
  }
}
