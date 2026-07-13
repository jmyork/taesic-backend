import router from '@adonisjs/core/services/router'

/**
 * Registered from a SEPARATE file imported BEFORE `./companydomainroutes.js` in routes.ts.
 *
 * Why this matters: ES module imports execute in the order they're written (hoisting only
 * affects import declarations relative to same-file code, not relative to each other), and
 * AdonisJS's router matches by REGISTRATION order when a concrete path is ambiguous with an
 * already-registered dynamic pattern. `companydomainroutes.ts` registers tenant resources under
 * `api/:company_alias/produtos` (etc.) — a request for `api/catalogo/produtos` is structurally
 * indistinguishable from that pattern (`company_alias="catalogo"`), so if the tenant group is
 * registered FIRST, it wins the match and the request 401s inside the tenant auth guard before
 * ever reaching our public controller. Registering these routes first (via this earlier-imported
 * file) makes the literal, public routes win instead. Confirmed by direct curl reproduction:
 * before this fix, `GET /api/catalogo/produtos` 401'd exactly like `GET /api/qualquer-coisa/produtos`
 * (i.e. any two-segment path whose second segment matches a real tenant resource name).
 */
router.post('api/promotores/registo', '#controllers/promotor_controller.registoPublico')
router.post('api/promotores/otp/pedir', '#controllers/promotor_auth_controller.pedirOtp')
router.post('api/promotores/otp/confirmar', '#controllers/promotor_auth_controller.confirmarOtp')
router.get('api/promotores/painel/resumo', '#controllers/promotor_painel_controller.resumo')
router.get('api/promotores/painel/produtos', '#controllers/promotor_painel_controller.produtos')

router.get('api/catalogo/produtos', '#controllers/catalogo_publico_controller.produtos')
router.get('api/p/:codigo_perfil', '#controllers/catalogo_publico_controller.perfil')
