import project_permissionRepository from '#repositories/project_permission_repository'
import {
  Createproject_permissionDTO,
  Updateproject_permissionDTO,
} from '#dtos/project_permission_dto'

export default class project_permissionService {
  repo = new project_permissionRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: Createproject_permissionDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: Updateproject_permissionDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
