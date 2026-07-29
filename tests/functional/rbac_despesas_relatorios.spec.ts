import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { userHasPermission } from '../../app/helpers/Utils.js'
import { createTenant, createUser } from '../helpers/fixtures.js'

/**
 * RBAC do módulo de relatórios/despesas — Admin, Gerente, Supervisor e AdminVisualizador
 * têm acesso aos relatórios (mesmo critério já usado para `domain_metricas.*`); Vendedor e
 * Estoquista não (mesma exclusão que `domain_metricas.*` já tinha). Só Admin/Gerente/
 * Supervisor podem registar despesas; AdminVisualizador só lê.
 */
test.group('RBAC - despesas e relatórios', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('Admin, Gerente e Supervisor têm acesso total aos relatórios', async ({ assert }) => {
    const { empresa, user: admin } = await createTenant()
    const gerente = await createUser(empresa, ['Gerente'])
    const supervisor = await createUser(empresa, ['Supervisor'])

    for (const user of [admin, gerente, supervisor]) {
      assert.isTrue(await userHasPermission(user, 'domain_relatorios.dashboard_executivo'))
      assert.isTrue(await userHasPermission(user, 'domain_relatorios.vendas'))
      assert.isTrue(await userHasPermission(user, 'domain_relatorios.fluxo_caixa'))
      assert.isTrue(await userHasPermission(user, 'domain_relatorios.impostos'))
    }
  })

  test('AdminVisualizador só lê relatórios e despesas (sem registar/editar/apagar despesas)', async ({ assert }) => {
    const { empresa } = await createTenant()
    const visualizador = await createUser(empresa, ['AdminVisualizador'])

    assert.isTrue(await userHasPermission(visualizador, 'domain_relatorios.dashboard_executivo'))
    assert.isTrue(await userHasPermission(visualizador, 'domain_despesas.index'))
    assert.isFalse(await userHasPermission(visualizador, 'domain_despesas.store'))
  })

  test('Vendedor e Estoquista não têm acesso a relatórios nem a despesas', async ({ assert }) => {
    const { empresa } = await createTenant()
    const vendedor = await createUser(empresa, ['Vendedor'])
    const estoquista = await createUser(empresa, ['Estoquista'])

    for (const user of [vendedor, estoquista]) {
      assert.isFalse(await userHasPermission(user, 'domain_relatorios.dashboard_executivo'))
      assert.isFalse(await userHasPermission(user, 'domain_despesas.index'))
      assert.isFalse(await userHasPermission(user, 'domain_despesas.store'))
    }
  })

  test('Admin, Gerente e Supervisor podem registar despesas; só Admin as pode apagar', async ({ assert }) => {
    const { empresa, user: admin } = await createTenant()
    const gerente = await createUser(empresa, ['Gerente'])
    const supervisor = await createUser(empresa, ['Supervisor'])

    for (const user of [admin, gerente, supervisor]) {
      assert.isTrue(await userHasPermission(user, 'domain_despesas.store'))
    }

    assert.isTrue(await userHasPermission(admin, 'domain_despesas.destroy'))
    assert.isFalse(await userHasPermission(gerente, 'domain_despesas.destroy'))
    assert.isFalse(await userHasPermission(supervisor, 'domain_despesas.destroy'))
  })
})
