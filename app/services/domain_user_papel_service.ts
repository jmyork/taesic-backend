import DomainUserPapelRepository from '#repositories/domain_user_papel_repository'
import { CreateDomainUserPapelDTO, DestroyDomainUserPapelDTO, DomainUserPapelQueryDTO } from '#dtos/domain_user_papel_dto'

export default class DomainUserPapelService {
  private repo = new DomainUserPapelRepository()

  list(data: DomainUserPapelQueryDTO) {
    return this.repo.list(data)
  }

  listAssignableRoles() {
    return this.repo.listAssignableRoles()
  }

  assign(data: CreateDomainUserPapelDTO) {
    return this.repo.assign(data)
  }

  revoke(data: DestroyDomainUserPapelDTO) {
    return this.repo.revoke(data)
  }
}
