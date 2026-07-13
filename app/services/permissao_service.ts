import permissaoRepository from '#repositories/permissao_repository'
import { CreatepermissaoDTO, UpdatepermissaoDTO } from '#dtos/permissao_dto'

export default class permissaoService {
  repo = new permissaoRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: CreatepermissaoDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: UpdatepermissaoDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
