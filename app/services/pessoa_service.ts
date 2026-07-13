import pessoaRepository from '#repositories/pessoa_repository'
import { CreatepessoaDTO, UpdatepessoaDTO } from '#dtos/pessoa_dto'

export default class pessoaService {
  repo = new pessoaRepository()

  list(page?: number, limit?: number, deleted?: DeletedValue, company_alias?: string) {
    return this.repo.paginate(page, limit, deleted, company_alias)
  }

  create(data: CreatepessoaDTO & { company_alias?: string }) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdatepessoaDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
