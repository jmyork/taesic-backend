import despesasRepository from '#repositories/despesas_repository'
import { CreatedespesasDTO, UpdatedespesasDTO, DespesasQueryDTO } from '#dtos/despesas_dto'

export default class despesasService {
  repo = new despesasRepository()

  list(page?: number, limit?: number, filter?: DespesasQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: CreatedespesasDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdatedespesasDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
