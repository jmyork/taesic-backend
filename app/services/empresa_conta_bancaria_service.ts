import empresa_conta_bancariaRepository from '#repositories/empresa_conta_bancaria_repository'
import {
  Createempresa_conta_bancariaDTO,
  Updateempresa_conta_bancariaDTO,
} from '#dtos/empresa_conta_bancaria_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class empresa_conta_bancariaService {
  repo = new empresa_conta_bancariaRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue) {
    return this.repo.paginate(page, limit, deleted)
  }

  create(data: Createempresa_conta_bancariaDTO) {
    return this.repo.create(data)
  }

  show(id: string) {
    return this.repo.findOrFail(id)
  }

  update(id: string, data: Updateempresa_conta_bancariaDTO) {
    return this.repo.update(id, data)
  }

  delete(id: string) {
    return this.repo.softDelete(id)
  }
}
