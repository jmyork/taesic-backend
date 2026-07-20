import subscricaoRepository from '#repositories/subscricao_repository'
import { CreatesubscricaoDTO, UpdatesubscricaoDTO } from '#dtos/subscricao_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class subscricaoService {
  repo = new subscricaoRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue, company_alias?: string) {
    return this.repo.paginate(page, limit, deleted, company_alias)
  }

  create(data: CreatesubscricaoDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdatesubscricaoDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
