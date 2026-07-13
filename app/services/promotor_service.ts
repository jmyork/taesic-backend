import PromotorRepository from '#repositories/promotor_repository'
import { CreatePromotorDTO, PromotorQueryDTO, UpdatePromotorDTO } from '#dtos/promotor_dto'

export default class PromotorService {
  repo = new PromotorRepository()

  list(page: number, limit: number, filter?: PromotorQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: CreatePromotorDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdatePromotorDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
