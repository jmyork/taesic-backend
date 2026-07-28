import metodopagamentoRepository from '#repositories/metodopagamento_repository'
import { CreatemetodopagamentoDTO, MetodoPagamentoQueryDTO, UpdatemetodopagamentoDTO } from '#dtos/metodopagamento_dto'

export default class metodopagamentoService {
  repo = new metodopagamentoRepository()

  list(page?: number, limit?: number, filter?: MetodoPagamentoQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: CreatemetodopagamentoDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdatemetodopagamentoDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
