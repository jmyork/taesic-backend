import produtosRepository from '#repositories/produtos_repository'
import {
  CreateprodutosDTO,
  UpdateprodutosDTO,
  CreateProdutoDetalhesDTO,
  ProdutoQueryDTO,
} from '#dtos/produtos_dto'
import { CatalogoProdutosFilterDTO } from '#dtos/catalogo_produtos_dto'

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

  catalogo(page: number, limit: number, filter: CatalogoProdutosFilterDTO, company_alias: string) {
    return this.repo.catalogo(page, limit, filter, company_alias)
  }

  alertas(company_alias: string, filter?: { tipo?: 'estoque' | 'validade' | 'todos'; page?: number; limit?: number }) {
    return this.repo.alertas(company_alias, filter)
  }
}
