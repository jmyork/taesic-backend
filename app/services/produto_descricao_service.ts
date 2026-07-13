import produto_descricaoRepository from '#repositories/produto_descricao_repository'
import {
  Createproduto_descricaoDTO,
  Updateproduto_descricaoDTO,
  ProdutoDescricaoQueryDTO,
} from '#dtos/produto_descricao_dto'

export default class produto_descricaoService {
  repo = new produto_descricaoRepository()

  list(page?: number, limit?: number, filter?: ProdutoDescricaoQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: Createproduto_descricaoDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: Updateproduto_descricaoDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
