import clienteRepository from '#repositories/cliente_repository'
import { CreateclienteDTO, UpdateclienteDTO } from '#dtos/cliente_dto'

export default class clienteService {
  repo = new clienteRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue, company_alias?: string) {
    return this.repo.paginate(page, limit, deleted, company_alias)
  }

  create(data: CreateclienteDTO & { company_alias?: string }) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdateclienteDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
