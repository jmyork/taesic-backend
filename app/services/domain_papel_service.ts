import DomainPapelRepository from '#repositories/domain_papel_repository'
import {
  CreateDomainPapelDTO,
  DestroyDomainPapelDTO,
  DomainPapelQueryDTO,
  ShowDomainPapelDTO,
  UpdateDomainPapelDTO,
} from '#dtos/domain_papel_dto'

export default class DomainPapelService {
  private repo = new DomainPapelRepository()

  list(data: DomainPapelQueryDTO) {
    return this.repo.paginate(data)
  }

  show(data: ShowDomainPapelDTO) {
    return this.repo.findOrFail(data.company_alias, data.id)
  }

  catalogoDePermissoes() {
    return this.repo.catalogoDePermissoes()
  }

  create(data: CreateDomainPapelDTO) {
    return this.repo.create(data)
  }

  update(data: UpdateDomainPapelDTO) {
    return this.repo.update(data)
  }

  destroy(data: DestroyDomainPapelDTO) {
    return this.repo.softDelete(data)
  }
}
