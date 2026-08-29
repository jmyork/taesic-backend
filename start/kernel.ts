/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
|
| The HTTP kernel file is used to register the middleware with the server
| or the router.
|
*/

import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

/**
 * The error handler is used to convert an exception
 * to an HTTP response.
 */
server.errorHandler(() => import('#exceptions/handler'))

/**
 * The server middleware stack runs middleware on all the HTTP
 * requests, even if there is no route registered for
 * the request URL.
 */
server.use([
  () => import('#middleware/container_bindings_middleware'),
  () => import('@adonisjs/static/static_middleware'),
  () => import('@adonisjs/cors/cors_middleware'),
])

/**
 * The router middleware stack runs middleware on all the HTTP
 * requests with a registered route.
 */
router.use([
  // Primeiro de todos, de propósito: se o pedido não vem do frontend indicado,
  // não vale a pena interpretar o corpo, abrir sessão nem inicializar a auth.
  () => import('#middleware/apenas_bff_middleware'),
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/session/session_middleware'),
  () => import('@adonisjs/shield/shield_middleware'),
  () => import('@adonisjs/auth/initialize_auth_middleware'),
  () => import('#middleware/initialize_bouncer_middleware'),
  // Depois da auth, de propósito: é dela que sai o actor da linha de auditoria.
  // Registado aqui e não por rota para que uma rota nova nasça auditada — ver o
  // comentário no próprio ficheiro.
  () => import('#middleware/activity_log_middleware'),
])

/**
 * Named middleware collection must be explicitly assigned to
 * the routes or the routes group.
 */
export const middleware = router.named({
  permission: () => import('#middleware/permission_middleware'),
  adminOnly: () => import('#middleware/admin_only_middleware'),
  validateCompanyAlias: () => import('#middleware/validate_company_alias_middleware'),
  auth: () => import('#middleware/auth_middleware'),
  ValidateCompanyAliasMiddleware: () => import('#middleware/validate_company_alias_middleware'),
})
