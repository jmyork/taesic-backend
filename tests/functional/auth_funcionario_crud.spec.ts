import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import AuthRepository from '#repositories/auth_repository'
import User from '#models/user'
import TaxaIva from '#models/taxa_iva'
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

/**
 * `auth/me` passou a devolver a identificação e as definições FISCAIS da empresa: sem
 * isto o frontend não tinha como saber se a empresa liquida IVA e assumia 14% fixos em
 * todos os documentos — em Angola o regime é por empresa e a taxa vem de `taxa_iva`.
 */
test.group('auth/me — definições fiscais da empresa', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('details() devolve a empresa com regime_iva e taxa', async ({ assert }) => {
    const { empresa, user } = await createTenant()

    const repo = new AuthRepository()
    const detalhes: any = await repo.details({ user_id: user.id })

    assert.isObject(detalhes.empresa, 'auth/me tem de identificar a empresa do utilizador')
    assert.equal(detalhes.empresa.id, empresa.id)
    assert.equal(detalhes.empresa.company_alias, empresa.company_alias)
    // O fixture cria a empresa com `regime_iva: false` — e tem de chegar como boolean,
    // não como o 0/1 que o driver mysql2 devolve.
    assert.isBoolean(detalhes.empresa.regime_iva)
    assert.isFalse(detalhes.empresa.regime_iva)
    assert.isNull(detalhes.empresa.taxa_iva.percentual, 'sem taxa associada, nada a assumir')
  })

  test('a taxa de IVA associada à empresa chega como número', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const taxa = await TaxaIva.create({ nome: 'IVA Geral', percentual: 14, ativo: true } as any)
    await empresa.merge({ regime_iva: true, taxa_iva_id: taxa.id } as any).save()

    const repo = new AuthRepository()
    const detalhes: any = await repo.details({ user_id: user.id })

    assert.isTrue(detalhes.empresa.regime_iva)
    assert.equal(detalhes.empresa.taxa_iva.percentual, 14)
    assert.equal(detalhes.empresa.taxa_iva.nome, 'IVA Geral')
  })
})
