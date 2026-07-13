import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import DomainUserPapelRepository from '#repositories/domain_user_papel_repository'
import UserNotInCompanyException from '#exceptions/user_not_in_company_exception'
import CannotAssignPlatformRoleException from '#exceptions/cannot_assign_platform_role_exception'
import Papel from '#models/auth/papel'
import UserPapel from '#models/auth/user_papel'
import { createEmpresa, createUser } from '../helpers/fixtures.js'

/**
 * A gestão de papéis (user_papel) só existia como recurso platform-only — um Admin de uma
 * empresa cliente não tinha nenhuma forma de atribuir/revogar papéis aos seus próprios
 * funcionários. Este repositório/rota tenant-scoped fecha essa lacuna, com duas garantias que
 * a versão platform-only não precisa de ter: o utilizador alvo tem de pertencer à mesma
 * empresa, e nunca se pode atribuir um papel de plataforma (Platform_*) a partir daqui.
 */
test.group('domain_user_papel_repository', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('atribui um papel de domínio a um utilizador da mesma empresa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    const vendedor = await Papel.findByOrFail('nome', 'Vendedor')

    const repo = new DomainUserPapelRepository()
    const assignment = await repo.assign({
      user_id: user.id,
      papel_id: vendedor.id,
      company_alias: empresa.company_alias,
    })

    assert.equal(assignment.user_id, user.id)
    assert.equal(assignment.papel_id, vendedor.id)
  })

  test('rejeita atribuir um papel a um utilizador de outra empresa', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const userDaEmpresaB = await createUser(empresaB)
    const vendedor = await Papel.findByOrFail('nome', 'Vendedor')

    const repo = new DomainUserPapelRepository()
    try {
      await repo.assign({
        user_id: userDaEmpresaB.id,
        papel_id: vendedor.id,
        company_alias: empresaA.company_alias,
      })
      assert.fail('deveria ter rejeitado')
    } catch (error) {
      assert.instanceOf(error, UserNotInCompanyException)
    }
  })

  test('rejeita atribuir um papel de plataforma (Platform_*) a partir de uma rota de tenant', async ({ assert }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    const platformAdmin = await Papel.findByOrFail('nome', 'Platform_Admin')

    const repo = new DomainUserPapelRepository()
    try {
      await repo.assign({ user_id: user.id, papel_id: platformAdmin.id, company_alias: empresa.company_alias })
      assert.fail('deveria ter rejeitado')
    } catch (error) {
      assert.instanceOf(error, CannotAssignPlatformRoleException)
    }
  })

  test('listAssignableRoles nunca inclui papéis Platform_*', async ({ assert }) => {
    const repo = new DomainUserPapelRepository()
    const roles = await repo.listAssignableRoles()
    assert.isTrue(roles.length > 0)
    assert.isFalse(roles.some((r) => r.nome.startsWith('Platform_')))
  })

  test('revoke só remove a atribuição se o utilizador pertencer a esta empresa', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const userA = await createUser(empresaA)
    const vendedor = await Papel.findByOrFail('nome', 'Vendedor')

    const repo = new DomainUserPapelRepository()
    const assignment = await repo.assign({
      user_id: userA.id,
      papel_id: vendedor.id,
      company_alias: empresaA.company_alias,
    })

    // a empresa B não consegue revogar uma atribuição de um utilizador que não é seu
    await repo.revoke({ id: assignment.id, company_alias: empresaB.company_alias }).catch((error) => {
      assert.equal(error.code, 'E_ROW_NOT_FOUND')
    })

    const stillActive = await UserPapel.query().where('id', assignment.id).whereNull('deleted_at').first()
    assert.isNotNull(stillActive, 'a atribuição não deve ter sido revogada pela empresa errada')

    // a própria empresa consegue revogar
    await repo.revoke({ id: assignment.id, company_alias: empresaA.company_alias })
    const revoked = await UserPapel.query().where('id', assignment.id).whereNull('deleted_at').first()
    assert.isNull(revoked, 'a atribuição deve ficar revogada (soft-deleted)')
  })

  test('atribuir o mesmo papel duas vezes é idempotente (não duplica a atribuição)', async ({ assert }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    const vendedor = await Papel.findByOrFail('nome', 'Vendedor')

    const repo = new DomainUserPapelRepository()
    await repo.assign({ user_id: user.id, papel_id: vendedor.id, company_alias: empresa.company_alias })
    await repo.assign({ user_id: user.id, papel_id: vendedor.id, company_alias: empresa.company_alias })

    const count = await UserPapel.query()
      .where('user_id', user.id)
      .where('papel_id', vendedor.id)
      .whereNull('deleted_at')
    assert.lengthOf(count, 1)
  })
})
