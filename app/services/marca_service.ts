import marcaRepository from '#repositories/marca_repository'
import { CreatemarcaDTO, MarcaQueryDTO, UpdatemarcaDTO } from '#dtos/marca_dto'

export default class marcaService {
  repo = new marcaRepository()

  list(page?: number, limit?: number, filter?: MarcaQueryDTO) {
    return this.repo.paginate(page, limit, filter)
  }

  create(data: CreatemarcaDTO) {
    return this.repo.create(data)
  }

  show(id: string, company_alias?: string) {
    return this.repo.findOrFail(id, company_alias)
  }

  update(id: string, data: UpdatemarcaDTO, company_alias?: string) {
    return this.repo.update(id, data, company_alias)
  }

  delete(id: string, company_alias?: string) {
    return this.repo.softDelete(id, company_alias)
  }
}
