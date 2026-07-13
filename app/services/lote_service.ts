import loteRepository from '#repositories/lote_repository'
import { CreateloteDTO, LoteQueryDTO, UpdateloteDTO } from '#dtos/lote_dto'

export default class loteService {
  repo = new loteRepository()

  list(page?: number, limit?: number, filter?: LoteQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: CreateloteDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdateloteDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
