import taxaIvaRepository from '#repositories/taxa_iva_repository'
import { CreatetaxaivaDTO, UpdatetaxaivaDTO } from '#dtos/taxa_iva_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class taxaIvaService {
  repo = new taxaIvaRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: CreatetaxaivaDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: UpdatetaxaivaDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
