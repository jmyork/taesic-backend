import posRepository from '#repositories/pos_repository'
import { CreateposDTO, PosQueryDTO, UpdateposDTO } from '#dtos/pos_dto'

export default class posService {
  repo = new posRepository()

  list(page?: number, limit?: number, filter?: PosQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: CreateposDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdateposDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
