import projectRepository from '#repositories/project_repository'
import { CreateprojectDTO, UpdateprojectDTO } from '#dtos/project_dto'

export default class projectService {
  repo = new projectRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: CreateprojectDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: UpdateprojectDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
