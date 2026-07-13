import cupomRepository from '#repositories/cupom_repository'
import { CreatecupomDTO, CupomQueryDTO, UpdatecupomDTO } from '#dtos/cupom_dto'

export default class cupomService {
  repo = new cupomRepository()

  list(page: number, limit: number, filter?: CupomQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: CreatecupomDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdatecupomDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
