import papel_permissaoRepository from '#repositories/papel_permissao_repository'
import { Createpapel_permissaoDTO, Updatepapel_permissaoDTO } from '#dtos/papel_permissao_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class papel_permissaoService {
  repo = new papel_permissaoRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: Createpapel_permissaoDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: Updatepapel_permissaoDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
