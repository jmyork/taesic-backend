import estoqueRepository from '#repositories/estoque_repository'
import { CreateestoqueDTO, EstoqueQueryDTO } from '#dtos/estoque_dto'

export default class estoqueService {
  repo = new estoqueRepository()

  list(page?: number, limit?: number, filter?: EstoqueQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: CreateestoqueDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }
}
