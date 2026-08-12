import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import AuthRepository from '#repositories/auth_repository'
import User from '#models/user'
import { createTenant, createUser } from '../helpers/fixtures.js'
import { userHasPermission } from '../../app/helpers/Utils.js'

/**
 * Editar/desactivar funcionário.
 *
 * Antes desta sessão NÃO existia nenhuma rota de update nem de delete de utilizador —
 * o ecrã de Funcionários tinha botões "Editar" e "Deletar" sem nada por trás
 * (`UsersUpdateValidator` existia mas nunca era usado por rota nenhuma).
 */
test.group('funcionário — editar e desactivar', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('update altera username e email', async ({ assert }) => {
    const { empresa } = await createTenant()
    const funcionario = await createUser(empresa, ['Vendedor'])

    const repo = new AuthRepository()
    await repo.update({
      user_id: funcionario.id,
      company_alias: empresa.company_alias,
      username: 'nome.novo',
      email: 'nome.novo@example.com',
    })

    const recarregado = await User.findOrFail(funcionario.id)
    assert.equal(recarregado.username, 'nome.novo')
    assert.equal(recarregado.email, 'nome.novo@example.com')
  })

  test('update não atravessa o isolamento por tenant', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()
    const funcionarioB = await createUser(tenantB.empresa, ['Vendedor'])

    const repo = new AuthRepository()
    // A empresa A não pode editar um funcionário da empresa B só por saber o UUID.
    await assert.rejects(() =>
      repo.update({
        user_id: funcionarioB.id,
        company_alias: tenantA.empresa.company_alias,
        username: 'invadido',
      })
    )

    const intacto = await User.findOrFail(funcionarioB.id)
    assert.notEqual(intacto.username, 'invadido')
  })

  test('softDelete alterna entre desactivar e reactivar', async ({ assert }) => {
    const { empresa } = await createTenant()
    const funcionario = await createUser(empresa, ['Vendedor'])
    const repo = new AuthRepository()

    await repo.softDelete({ user_id: funcionario.id, company_alias: empresa.company_alias })
    assert.isNotNull((await User.findOrFail(funcionario.id)).deletedAt)

    await repo.softDelete({ user_id: funcionario.id, company_alias: empresa.company_alias })
    assert.isNull((await User.findOrFail(funcionario.id)).deletedAt, 'segunda chamada reactiva')
  })

  test('softDelete não atravessa o isolamento por tenant', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()
    const funcionarioB = await createUser(tenantB.empresa, ['Vendedor'])

    const repo = new AuthRepository()
    await assert.rejects(() =>
      repo.softDelete({ user_id: funcionarioB.id, company_alias: tenantA.empresa.company_alias })
    )
    assert.isNull((await User.findOrFail(funcionarioB.id)).deletedAt)
  })

  test('a listagem devolve os papéis de cada funcionário', async ({ assert }) => {
    const { empresa } = await createTenant()
    const vendedor = await createUser(empresa, ['Vendedor'])
    await createUser(empresa, ['Estoquista'])

    const repo = new AuthRepository()
    const pagina = await repo.list({ company_alias: empresa.company_alias, limit: 50 })
    const linha = pagina.all().find((u) => u.id === vendedor.id)!.toJSON() as any

    assert.deepEqual(linha.papeis, ['Vendedor'], 'sem isto o ecrã não sabe a função do funcionário')

    const todos = pagina.all().map((u) => (u.toJSON() as any).papeis).flat()
    assert.include(todos, 'Estoquista')
  })

  test('permissões: Admin e AdminUserManager podem editar/desactivar; Vendedor não', async ({
    assert,
  }) => {
    const { empresa, user: admin } = await createTenant()
    const userManager = await createUser(empresa, ['AdminUserManager'])
    const vendedor = await createUser(empresa, ['Vendedor'])

    for (const perm of ['domain_auth.update', 'domain_auth.destroy']) {
      assert.isTrue(await userHasPermission(admin, perm), `Admin devia ter ${perm}`)
      assert.isTrue(await userHasPermission(userManager, perm), `AdminUserManager devia ter ${perm}`)
      assert.isFalse(await userHasPermission(vendedor, perm), `Vendedor NÃO devia ter ${perm}`)
    }
  })
})
