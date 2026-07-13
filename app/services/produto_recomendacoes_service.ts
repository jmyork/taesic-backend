import produto_recomendacoesRepository from '#repositories/produto_recomendacoes_repository'
import {
  Createproduto_recomendacoesDTO,
  ProdutoRecomendacaoQueryDTO,
  Updateproduto_recomendacoesDTO,
} from '#dtos/produto_recomendacoes_dto'

export default class produto_recomendacoesService {
  repo = new produto_recomendacoesRepository()

  list(page?: number, limit?: number, filter?: ProdutoRecomendacaoQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: Createproduto_recomendacoesDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: Updateproduto_recomendacoesDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
