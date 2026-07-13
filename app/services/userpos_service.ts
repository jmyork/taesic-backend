import userposRepository from '#repositories/userpos_repository'
import { CreateuserposDTO, UserPosQueryDTO } from '#dtos/userpos_dto'

export default class userposService {
  repo = new userposRepository()

  list(page?: number, limit?: number, filter?: UserPosQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: CreateuserposDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
