import project_user_roleRepository from '#repositories/project_user_role_repository'
import { Createproject_user_roleDTO, Updateproject_user_roleDTO } from '#dtos/project_user_role_dto'

export default class project_user_roleService {
  repo = new project_user_roleRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: Createproject_user_roleDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: Updateproject_user_roleDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
