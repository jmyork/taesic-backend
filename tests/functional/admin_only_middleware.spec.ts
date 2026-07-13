import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import AdminOnlyMiddleware from '#middleware/admin_only_middleware'
import Papel from '#models/auth/papel'
import { createEmpresa, createUser } from '../helpers/fixtures.js'

/**
 * Regressão para admin_only_middleware, que antes era um no-op completo: chamava
 * `userHasRole()` sem `await` nem usar o resultado e avançava sempre para `next()`,
 * deixando qualquer utilizador autenticado passar por rotas restritas a
 * administradores da plataforma.
 */
test.group('admin_only_middleware', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('bloqueia um utilizador sem papel Platform_*', async ({ assert }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa) // sem papéis

    const ctx = await testUtils.createHttpContext()
    ;(ctx as any).auth = { user }

    let nextCalled = false
    const middleware = new AdminOnlyMiddleware()
    await middleware.handle(ctx, async () => {
      nextCalled = true
    })

    assert.isFalse(nextCalled, 'next() não deve ser chamado para um utilizador sem papel de plataforma')
    assert.equal(ctx.response.getStatus(), 403)
  })

  test('deixa passar um utilizador com papel Platform_*', async ({ assert }) => {
    await Papel.firstOrCreate({ nome: 'Platform_Admin' }, { nome: 'Platform_Admin', descricao: 'Admin da plataforma' })
    const empresa = await createEmpresa()
    const user = await createUser(empresa, ['Platform_Admin'])

    const ctx = await testUtils.createHttpContext()
    ;(ctx as any).auth = { user }

    let nextCalled = false
    const middleware = new AdminOnlyMiddleware()
    await middleware.handle(ctx, async () => {
      nextCalled = true
    })

    assert.isTrue(nextCalled, 'next() deve ser chamado para um utilizador com papel Platform_*')
  })
})
