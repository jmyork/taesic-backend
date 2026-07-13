import { DateTime } from 'luxon'
import UserPapel from '#models/auth/user_papel'
import Papel from '#models/auth/papel'
import User from '#models/user'
import Empresa from '#models/empresa'
import {
  CreateDomainUserPapelDTO,
  DestroyDomainUserPapelDTO,
  DomainUserPapelQueryDTO,
} from '#dtos/domain_user_papel_dto'
import UserNotInCompanyException from '#exceptions/user_not_in_company_exception'
import CannotAssignPlatformRoleException from '#exceptions/cannot_assign_platform_role_exception'

export default class DomainUserPapelRepository {
  /** Lista as associações utilizador-papel dos utilizadores desta empresa (nunca de outra). */
  async list(data: DomainUserPapelQueryDTO) {
    return UserPapel.query()
      .join('user', 'user.id', 'user_papel.user_id')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('empresa.company_alias', data.company_alias)
      .whereNull('user_papel.deleted_at')
      .preload('User')
      .preload('papel')
      .select('user_papel.*')
      .paginate(data.page ?? 1, data.limit ?? 50)
  }

  /** Papéis que um admin de tenant pode atribuir — nunca os papéis de plataforma (Platform_*). */
  async listAssignableRoles() {
    return Papel.query().whereNot('nome', 'like', 'Platform_%').whereNull('deleted_at').orderBy('nome', 'asc')
  }

  private async assertUserBelongsToCompany(userId: string, companyAlias: string) {
    const empresa = await Empresa.findByOrFail('company_alias', companyAlias)
    const user = await User.findOrFail(userId)
    if (user.empresa_id !== empresa.id) {
      throw new UserNotInCompanyException()
    }
    return { user, empresa }
  }

  async assign(data: CreateDomainUserPapelDTO) {
    await this.assertUserBelongsToCompany(data.user_id, data.company_alias)

    const papel = await Papel.findOrFail(data.papel_id)
    if (papel.nome.startsWith('Platform_')) {
      throw new CannotAssignPlatformRoleException()
    }

    const existing = await UserPapel.query()
      .where('user_id', data.user_id)
      .where('papel_id', data.papel_id)
      .whereNull('deleted_at')
      .first()
    if (existing) {
      return existing
    }

    return UserPapel.create({ user_id: data.user_id, papel_id: data.papel_id })
  }

  async revoke(data: DestroyDomainUserPapelDTO) {
    const assignment = await UserPapel.query()
      .where('user_papel.id', data.id)
      .join('user', 'user.id', 'user_papel.user_id')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('empresa.company_alias', data.company_alias)
      .select('user_papel.*')
      .firstOrFail()

    assignment.deletedAt = DateTime.now()
    await assignment.save()
    return assignment
  }
}
