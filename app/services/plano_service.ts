import planoRepository from '#repositories/plano_repository'
import { CreateplanoDTO, UpdateplanoDTO } from '#dtos/plano_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class planoService {
  repo = new planoRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: CreateplanoDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: UpdateplanoDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
