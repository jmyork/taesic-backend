import cobrancaRepository from '#repositories/cobranca_repository'
import { CreatecobrancaDTO, UpdatecobrancaDTO } from '#dtos/cobranca_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class cobrancaService {
  repo = new cobrancaRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue, company_alias?: string) {
    return this.repo.paginate(page, limit, deleted, company_alias)
  }

  create(data: CreatecobrancaDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdatecobrancaDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
