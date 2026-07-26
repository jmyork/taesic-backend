import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { userHasPermission } from '../../app/helpers/Utils.js'
import { createTenant, createUser } from '../helpers/fixtures.js'

/**
 * Regressão: os papéis `Gerente`/`Supervisor` existiam na tabela `papel` mas nunca tinham
 * nenhuma linha em `papel_permissao` (o seeder nunca chamava `givePermissionsToRole` para
 * eles) — um utilizador só com um destes papéis autenticava-se normalmente, mas
 * `permission_middleware` bloqueava-o com 403 em TODAS as rotas de domínio, apesar de já
 * existir lógica (ex.: `caixa_repository.close/reopen/destroy`) a tratá-los como papéis de
 * gestão. Passaram a receber o mesmo conjunto operacional do Vendedor, mais leitura de
 * métricas de desempenho da loja.
 *
 * Também cobre o novo conjunto de permissões `domain_metodo_pagamento.*`: só Admin
 * cria/edita/apaga métodos de pagamento; Gerente/Supervisor/Vendedor/Estoquista só têm
 * leitura (index/show).
 */
test.group('RBAC - Gerente/Supervisor têm acesso operacional (antes bloqueados em tudo)', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('Gerente tem as permissões operacionais do dia-a-dia', async ({ assert }) => {
    const { empresa } = await createTenant()
    const gerente = await createUser(empresa, ['Gerente'])

    assert.isTrue(await userHasPermission(gerente, 'domain_caixas.store'))
    assert.isTrue(await userHasPermission(gerente, 'domain_caixas.destroy'))
    assert.isTrue(await userHasPermission(gerente, 'domain_vendas.store'))
    assert.isTrue(await userHasPermission(gerente, 'domain_vendas_itens.store'))
    assert.isTrue(await userHasPermission(gerente, 'domain_metodo_pagamento.index'))
    assert.isTrue(await userHasPermission(gerente, 'domain_metricas.resumo'))
  })

  test('Supervisor tem as permissões operacionais do dia-a-dia', async ({ assert }) => {
    const { empresa } = await createTenant()
    const supervisor = await createUser(empresa, ['Supervisor'])

    assert.isTrue(await userHasPermission(supervisor, 'domain_caixas.store'))
    assert.isTrue(await userHasPermission(supervisor, 'domain_vendas.store'))
    assert.isTrue(await userHasPermission(supervisor, 'domain_metodo_pagamento.show'))
    assert.isTrue(await userHasPermission(supervisor, 'domain_metricas.postos'))
  })

  test('Gerente/Supervisor não têm acesso a rotas de gestão exclusivas do Admin', async ({ assert }) => {
    const { empresa } = await createTenant()
    const gerente = await createUser(empresa, ['Gerente'])
    const supervisor = await createUser(empresa, ['Supervisor'])

    for (const user of [gerente, supervisor]) {
      assert.isFalse(await userHasPermission(user, 'domain_user_papel.destroy'))
      assert.isFalse(await userHasPermission(user, 'domain_metodo_pagamento.store'))
      assert.isFalse(await userHasPermission(user, 'domain_metodo_pagamento.update'))
      assert.isFalse(await userHasPermission(user, 'domain_metodo_pagamento.destroy'))
    }
  })

  test('só Admin pode criar/editar/apagar métodos de pagamento', async ({ assert }) => {
    const { empresa, user: admin } = await createTenant()
    const vendedor = await createUser(empresa, ['Vendedor'])
    const estoquista = await createUser(empresa, ['Estoquista'])

    assert.isTrue(await userHasPermission(admin, 'domain_metodo_pagamento.store'))
    assert.isTrue(await userHasPermission(admin, 'domain_metodo_pagamento.update'))
    assert.isTrue(await userHasPermission(admin, 'domain_metodo_pagamento.destroy'))

    for (const user of [vendedor, estoquista]) {
      assert.isTrue(await userHasPermission(user, 'domain_metodo_pagamento.index'))
      assert.isTrue(await userHasPermission(user, 'domain_metodo_pagamento.show'))
      assert.isFalse(await userHasPermission(user, 'domain_metodo_pagamento.store'))
      assert.isFalse(await userHasPermission(user, 'domain_metodo_pagamento.update'))
      assert.isFalse(await userHasPermission(user, 'domain_metodo_pagamento.destroy'))
    }
  })
})
