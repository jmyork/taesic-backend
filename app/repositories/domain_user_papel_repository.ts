import { DateTime } from 'luxon'
import UserPapel from '#models/auth/user_papel'
import Papel, { ESCOPO_PAPEL } from '#models/auth/papel'
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

  /**
   * Papéis que esta empresa pode atribuir: os SEUS, e mais nenhuns.
   *
   * Antes devolvia `whereNot('nome','like','Platform_%')` — ou seja, todos os
   * papéis de inquilino existentes na plataforma. Enquanto eram partilhados isso
   * era simplesmente a lista; agora que cada empresa tem os seus, seria dar à
   * empresa A a lista de papéis da empresa B e deixá-la atribuí-los aos seus
   * utilizadores. A filtragem passa a ser por `empresa_id`, e o `escopo` exclui
   * de uma vez tanto os de plataforma como os `modelo` (que existem para ser
   * clonados, não usados).
   */
  async listAssignableRoles(companyAlias: string) {
    const empresa = await Empresa.findByOrFail('company_alias', companyAlias)

    return Papel.query()
      .where('empresa_id', empresa.id)
      .where('escopo', ESCOPO_PAPEL.empresa)
      .whereNull('deleted_at')
      .orderBy('nome', 'asc')
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
    const { empresa } = await this.assertUserBelongsToCompany(data.user_id, data.company_alias)

    const papel = await Papel.findOrFail(data.papel_id)

    // A verificação era `papel.nome.startsWith('Platform_')` — pelo nome. Isso
    // recusava os papéis de plataforma mas aceitava, sem dar por isso, o papel de
    // OUTRA empresa: o id vem do corpo do pedido, e nada o obrigava a pertencer a
    // esta. `pertenceA()` exige as duas coisas ao mesmo tempo — âmbito de empresa
    // E esta empresa — e por isso recusa de uma vez os de plataforma, os `modelo`
    // e os alheios.
    if (!papel.pertenceA(empresa.id)) {
      throw new CannotAssignPlatformRoleException()
    }

    // Procura o par SEM filtrar por `deleted_at`: `revoke()` só marca a linha como
    // removida, mas a unique composta da BD (`user_papel` unique user_id+papel_id)
    // cobre também essas. Filtrar só pelas activas — como estava — deixava passar a
    // reatribuição de um papel antes revogado, que depois rebentava com ER_DUP_ENTRY
    // (500). Mesma classe de problema já corrigida em `userpos_repository.create()`.
    const existing = await UserPapel.query()
      .where('user_id', data.user_id)
      .where('papel_id', data.papel_id)
      .first()

    if (existing) {
      // Já activo: idempotente. Revogado: revive-se, em vez de criar linha nova.
      if (existing.deletedAt) {
        existing.deletedAt = null
        await existing.save()
      }
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
