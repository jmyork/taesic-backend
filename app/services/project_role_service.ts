import project_roleRepository from '#repositories/project_role_repository'
import { Createproject_roleDTO, Updateproject_roleDTO } from '#dtos/project_role_dto'

export default class project_roleService {
  repo = new project_roleRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: Createproject_roleDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: Updateproject_roleDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
