import project_permission_roleRepository from '#repositories/project_permission_role_repository'
import {
  Createproject_permission_roleDTO,
  Updateproject_permission_roleDTO,
} from '#dtos/project_permission_role_dto'

export default class project_permission_roleService {
  repo = new project_permission_roleRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: Createproject_permission_roleDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: Updateproject_permission_roleDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
