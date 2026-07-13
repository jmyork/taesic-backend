import produto_contraindicacoesRepository from '#repositories/produto_contraindicacoes_repository'
import {
  Createproduto_contraindicacoesDTO,
  ProdutoContraIndicacaoQueryDTO,
  Updateproduto_contraindicacoesDTO,
} from '#dtos/produto_contraindicacoes_dto'

export default class produto_contraindicacoesService {
  repo = new produto_contraindicacoesRepository()

  list(page?: number, limit?: number, filter?: ProdutoContraIndicacaoQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: Createproduto_contraindicacoesDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: Updateproduto_contraindicacoesDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
