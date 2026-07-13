import router from '@adonisjs/core/services/router'
// TEM de ser importado antes de `./companydomainroutes.js` — ver o comentário em
// public_platform_routes.ts para a explicação completa da colisão de rotas que isto evita.
import './public_platform_routes.js'
import './companydomainroutes.js'
import { middleware } from './kernel.js'

// router.post('create-company-account', '#controllers/empresa_controller.create_account')
router.post('api/create-company-with-details','#controllers/empresa_controller.create_account_with_detalhes')//(v)
router.get('api/verify/:token', '#controllers/empresa_controller.activate_company')//(v)
router.post('api/resend-company-activation-email','#controllers/empresa_controller.resend_verification_email')//(v)
router.post('api/auth/login', '#controllers/auth_controller.login') //(V)

router.post('api/auth/logout', '#controllers/auth_controller.logout').use(middleware.auth({ guards: ['api'] })) //(v)

// diligencias iniciais para criar conta, seu user e empresa. // criar conta, seu user e empresa.
// verificar email para criar conta, seu user e empresa.
// router.post('create-company-account/verify-email', '#controllers/empresa_controller.verify_email')

// criar fazer setup da empresa, dependente da escolha do tipo de empresa para criar produto, ponto de venda, criar caixa, conta de banco, etc.
// router.post('setup-company', '#controllers/empresa_controller.setup_company')

// --------------------------------------------------------------------------------
// router.post('create--account', '#controllers/empresa_controller.platform_create_account') //(V)
router.get('auth/reset-password/:token', '#controllers/auth_controller.password_recovery')
router.post('auth/forgot-password', '#controllers/auth_controller.forgotPassword')

// router.post('/register', '#controllers/auth_controller.register')

// criar conta, seu user e empresa.
router.resource(
  'verification_token_hash',
  () => import('#controllers/verification_token_hash_controller')
)

// Rotas adicionais para verificação de token
// router.post('/verification-token/:id/verify', '#controllers/verification_token_hash_controller.verify')
// router.get('/verify/:token', '#controllers/verification_token_hash_controller.verify')

router.post(
  '/verification-token/:id/activate',
  '#controllers/verification_token_hash_controller.activate'
)
router.post(
  '/verification-token/cleanup',
  '#controllers/verification_token_hash_controller.cleanup'
)
router.get(
  '/verification-token/user/:userId',
  '#controllers/verification_token_hash_controller.byUser'
)
router.get(
  '/verification-token/company/:empresaId',
  '#controllers/verification_token_hash_controller.byCompany'
)

// cliente, pessoa, vendapagamento, subscricao e cobranca foram movidos para
// companydomainroutes.ts: exigem autenticação e isolamento por empresa (company_alias),
// e nunca devem ser expostos sem essas duas camadas de proteção.

// router.resource('cupom',()=>import('#controllers/cupom_controller')).apiOnly()
router
  .group(() => {
    // --------------
    router
      .resource('metodo-pagamento', () => import('#controllers/metodopagamento_controller'))
      .apiOnly()
      .as('platform_metodo_pagamento')



    router
      .resource('permissao',() => import('#controllers/permissao_controller'))
      .apiOnly()
      .as('platform_permissao')

    router
      .resource('papel', () => import('#controllers/papel_controller'))
      .apiOnly()
      .as('platform_papel')


    router
      .resource('papel-permissao', () => import('#controllers/papel_permissao_controller'))
      .apiOnly()
      // `update` está comentado no controller (nunca foi implementado) — sem este .except() a
      // rota fica registada e responde com um 500 em vez de simplesmente não existir.
      .except(['update'])
      .as('platform_papel_permissao')

    router
      .resource('user-papel', () => import('#controllers/user_papel_controller'))
      .apiOnly()
      // idem: `update` está comentado no controller.
      .except(['update'])
      .as('platform_user_papel')

    router
      .resource('cupom', () => import('#controllers/cupom_controller'))
      .apiOnly()
      .as('platform_cupom')

    router
      .resource('plano', () => import('#controllers/plano_controller'))
      .apiOnly()
      .as('platform_plano')

  })
  .prefix('api')
  .use(middleware.auth({ guards: ['api'] }))
  .use(middleware.adminOnly())