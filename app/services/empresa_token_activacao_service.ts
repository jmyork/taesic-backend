import empresa_token_activacaoRepository from '#repositories/empresa_token_activacao_repository'
import {
  Createempresa_token_activacaoDTO,
  Updateempresa_token_activacaoDTO,
} from '#dtos/empresa_token_activacao_dto'

export default class empresa_token_activacaoService {
  repo = new empresa_token_activacaoRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: Createempresa_token_activacaoDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: Updateempresa_token_activacaoDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
