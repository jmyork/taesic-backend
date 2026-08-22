import router from '@adonisjs/core/services/router'

// auto swagger
import AutoSwagger from "adonis-autoswagger";
import swagger from "#config/swagger";
// TEM de ser importado antes de `./companydomainroutes.js` — ver o comentário em
// public_platform_routes.ts para a explicação completa da colisão de rotas que isto evita.
import './public_platform_routes.js'
import './companydomainroutes.js'
import { middleware } from './kernel.js'
import { loginThrottle, loginIpThrottle, signupThrottle, emailActionThrottle } from '#start/limiter'
import { controllers } from '#generated/controllers'

router.post('api/create-company-with-details', [controllers.Empresa, 'create_account_with_detalhes']).use(signupThrottle)//(v)
router.get('api/verify/:token', [controllers.Empresa, 'activate_company'])//(v)
router.post('api/resend-company-activation-email', [controllers.Empresa, 'resend_verification_email']).use(emailActionThrottle)//(v)
// Dois limitadores, de proposito: `loginThrottle` conta por CONTA (trava o
// brute-force a um alvo, venha de onde vier) e `loginIpThrottle` conta por
// ORIGEM (trava a pulverizacao por muitas contas a partir do mesmo sitio).
// Nenhum dos dois sozinho cobre o outro caso.
router
  .post('api/auth/login', [controllers.Auth, 'login'])
  .use([loginThrottle, loginIpThrottle]) //(V)

router.post('api/auth/logout', [controllers.Auth, 'logout']).use(middleware.auth({ guards: ['api'] })) //(v)

// As versões top-level de reset/forgot-password (`auth/reset-password/:token` GET →
// `password_recovery`, `auth/forgot-password` POST → `forgotPassword`) nunca
// funcionaram: nenhum dos dois métodos existe em AuthController (só `reset_password` e
// `forgot_password`, ambos POST) — e `forgot_password` precisa de `params.company_alias`,
// que uma rota sem `:company_alias` no path nunca tem. Só detectado agora, ao migrar
// para a notação de tuplo (que verifica o nome do método em tempo de compilação — a
// string mágica anterior nunca era validada). A funcionalidade real e testada já existe
// em `api/:company_alias/auth/reset-password/:token` e `api/:company_alias/auth/forgot-password`
// (companydomainroutes.ts) — removidas aqui como duplicados quebrados, não como perda de
// funcionalidade.

router.post(
  '/verification-token/:id/activate',
  [controllers.VerificationTokenHash, 'activate']
)
router.post(
  '/verification-token/cleanup',
  [controllers.VerificationTokenHash, 'cleanup']
)
router.get(
  '/verification-token/user/:userId',
  [controllers.VerificationTokenHash, 'byUser']
)
router.get(
  '/verification-token/company/:empresaId',
  [controllers.VerificationTokenHash, 'byCompany']
)

// cliente, pessoa, vendapagamento, subscricao e cobranca foram movidos para
// companydomainroutes.ts: exigem autenticação e isolamento por empresa (company_alias),
// e nunca devem ser expostos sem essas duas camadas de proteção.

router
  .group(() => {
    // --------------
    router
      .resource('permissao', controllers.Permissao)
      .apiOnly()
      .as('platform_permissao')

    router
      .resource('papel', controllers.Papel)
      .apiOnly()
      .as('platform_papel')


    router
      .resource('papel-permissao', controllers.PapelPermissao)
      .apiOnly()
      // `update` está comentado no controller (nunca foi implementado) — sem este .except() a
      // rota fica registada e responde com um 500 em vez de simplesmente não existir.
      .except(['update'])
      .as('platform_papel_permissao')

    router
      .resource('user-papel', controllers.UserPapel)
      .apiOnly()
      // idem: `update` está comentado no controller.
      .except(['update'])
      .as('platform_user_papel')

    router
      .resource('cupom', controllers.Cupom)
      .apiOnly()
      .as('platform_cupom')

    router
      .resource('plano', controllers.Plano)
      .apiOnly()
      .as('platform_plano')

    router
      .resource('taxa-iva', controllers.TaxaIva)
      .apiOnly()
      .as('platform_taxa_iva')

    // Relatórios do proprietário da plataforma — cross-tenant, só leitura (ver
    // relatorios_plataforma_repository.ts).
    router.get('relatorios-plataforma/contas-receber', [controllers.RelatoriosPlataforma, 'contasReceber']).as('platform_relatorios.contas_receber')
    router.get('relatorios-plataforma/receita', [controllers.RelatoriosPlataforma, 'receitaPlataforma']).as('platform_relatorios.receita')
    router.get('relatorios-plataforma/empresas-resumo', [controllers.RelatoriosPlataforma, 'empresasResumo']).as('platform_relatorios.empresas_resumo')
    router.get('relatorios-plataforma/uso', [controllers.RelatoriosPlataforma, 'usoPlataforma']).as('platform_relatorios.uso')
    router.get('relatorios-plataforma/auditoria', [controllers.RelatoriosPlataforma, 'auditoria']).as('platform_relatorios.auditoria')

  })
  .prefix('api')
  .use(middleware.auth({ guards: ['api'] }))
  .use(middleware.adminOnly())




// returns swagger in YAML
router.get("/swagger", async () => {
  return AutoSwagger.default.docs(router.toJSON(), swagger);
});

// Renders Swagger-UI and passes YAML-output of /swagger
router.get("/docs", async () => {
  return AutoSwagger.default.ui("/swagger", swagger);
  // return AutoSwagger.default.scalar("/swagger"); to use Scalar instead. If you want, you can pass proxy url as second argument here.
  // return AutoSwagger.default.rapidoc("/swagger", "view"); to use RapiDoc instead (pass "view" default, or "read" to change the render-style)
});