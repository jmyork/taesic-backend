import papelRepository from '#repositories/papel_repository'
import { CreatepapelDTO, UpdatepapelDTO } from '#dtos/papel_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class papelService {
  repo = new papelRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: CreatepapelDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: UpdatepapelDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
