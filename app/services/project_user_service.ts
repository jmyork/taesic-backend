import project_userRepository from '#repositories/project_user_repository'
import { Createproject_userDTO, Updateproject_userDTO } from '#dtos/project_user_dto'

export default class project_userService {
  repo = new project_userRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: Createproject_userDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: Updateproject_userDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
