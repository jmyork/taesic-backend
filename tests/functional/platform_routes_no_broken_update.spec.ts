import { test } from '@japa/runner'
import router from '@adonisjs/core/services/router'

/**
 * Regressão: papel_permissao_controller e user_papel_controller têm o método `update`
 * comentado (nunca implementado), mas as rotas platform_papel_permissao/platform_user_papel
 * eram registadas com `.apiOnly()` sem excluir `update` — um PUT/PATCH real chegava a existir
 * como rota e rebentava com um 500 ao invocar um método inexistente, em vez de simplesmente
 * não existir (404).
 */
test.group('rotas de plataforma sem update partido', () => {
  test('não existe nenhuma rota PUT/PATCH para papel-permissao/:id ou user-papel/:id', ({ assert }) => {
    const routes = router.toJSON()
    const allRoutes = Object.values(routes).flat()

    const brokenRoutes = allRoutes.filter(
      (route) =>
        (route.pattern === '/api/papel-permissao/:id' || route.pattern === '/api/user-papel/:id') &&
        (route.methods.includes('PUT') || route.methods.includes('PATCH'))
    )

    assert.lengthOf(brokenRoutes, 0)
  })
})
