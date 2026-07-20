import user_papelRepository from '#repositories/user_papel_repository'
import { Createuser_papelDTO, Updateuser_papelDTO } from '#dtos/user_papel_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class user_papelService {
  repo = new user_papelRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: Createuser_papelDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: Updateuser_papelDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
