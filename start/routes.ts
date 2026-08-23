import router from '@adonisjs/core/services/router'
import app from '@adonisjs/core/services/app'
import env from '#start/env'

// auto swagger
import AutoSwagger from 'adonis-autoswagger'
import swagger from '#config/swagger'
// TEM de ser importado antes de `./companydomainroutes.js` — ver o comentário em
// public_platform_routes.ts para a explicação completa da colisão de rotas que isto evita.
import './public_platform_routes.js'
import './companydomainroutes.js'
import { middleware } from './kernel.js'
import { loginThrottle, loginIpThrottle, signupThrottle, emailActionThrottle } from '#start/limiter'
import { controllers } from '#generated/controllers'

router
  .post('api/create-company-with-details', [controllers.Empresa, 'create_account_with_detalhes'])
  .use(signupThrottle) //(v)
router.get('api/verify/:token', [controllers.Empresa, 'activate_company']) //(v)
router
  .post('api/resend-company-activation-email', [controllers.Empresa, 'resend_verification_email'])
  .use(emailActionThrottle) //(v)
// Dois limitadores, de proposito: `loginThrottle` conta por CONTA (trava o
// brute-force a um alvo, venha de onde vier) e `loginIpThrottle` conta por
// ORIGEM (trava a pulverizacao por muitas contas a partir do mesmo sitio).
// Nenhum dos dois sozinho cobre o outro caso.
router.post('api/auth/login', [controllers.Auth, 'login']).use([loginThrottle, loginIpThrottle]) //(V)

router
  .post('api/auth/logout', [controllers.Auth, 'logout'])
  .use(middleware.auth({ guards: ['api'] })) //(v)

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

router.post('/verification-token/:id/activate', [controllers.VerificationTokenHash, 'activate'])
router.post('/verification-token/cleanup', [controllers.VerificationTokenHash, 'cleanup'])
router.get('/verification-token/user/:userId', [controllers.VerificationTokenHash, 'byUser'])
router.get('/verification-token/company/:empresaId', [
  controllers.VerificationTokenHash,
  'byCompany',
])

// cliente, pessoa, vendapagamento, subscricao e cobranca foram movidos para
// companydomainroutes.ts: exigem autenticação e isolamento por empresa (company_alias),
// e nunca devem ser expostos sem essas duas camadas de proteção.

/**
 * O que resta do grupo de plataforma neste backend: UMA rota.
 *
 * Todo o resto — `papel`, `permissao`, `papel_permissao`, `user_papel`, `plano`,
 * `taxa_iva`, `relatorios_plataforma` e as acções de suspender/reactivar uma
 * empresa — mudou-se para `taesic-backoffice-api`, por decisão do dono do produto:
 * os endpoints da plataforma vivem no backend do backoffice, não aqui.
 *
 * `platform_cupom` ficou, e ficou ASSINALADO, porque a premissa não se confirma.
 * A ideia era que os cupões de plataforma fossem de quem promove a PLATAFORMA e
 * ganha sobre a venda de pacotes de assinatura. Isso não existe no esquema:
 * `cupom_id` só aparece em `vendas`, e `subscricao`/`cobranca` não têm ligação
 * nenhuma a cupões — o painel do promotor calcula ganhos por `vendas` → `cupom` →
 * `empresa`, ou seja, sobre vendas DENTRO de uma empresa. Esta rota é, hoje, CRUD
 * cross-tenant sobre os cupões de desconto dos inquilinos. Levá-la para o
 * backoffice seria mudar a coisa errada com o nome certo.
 *
 * Fica aqui até haver decisão: ou se apaga (cada empresa já gere os seus por
 * `domain_cupom`), ou se desenha a funcionalidade que falta — cupão ligado a
 * `subscricao`/`cobranca`, com comissão — e essa nasce no backoffice, em tabelas
 * próprias.
 *
 * `AdminOnlyMiddleware` e `userHasPlatformRole()` continuam neste projecto SÓ por
 * causa desta rota. Quando ela sair, saem com ela.
 */
router
  .group(() => {
    router.resource('cupom', controllers.Cupom).apiOnly().as('platform_cupom')
  })
  .prefix('api')
  .use(middleware.auth({ guards: ['api'] }))
  .use(middleware.adminOnly())

/**
 * Documentação da API — NÃO registada em produção, por omissão.
 *
 * Estas duas rotas serviam a especificação inteira a quem a pedisse: 146
 * caminhos, 252 KB, sem autenticação nenhuma. E o BFF piorava-o em vez de o
 * tapar — `app.taesic.../api/bff/swagger` devolvia tudo a um visitante anónimo,
 * porque era o proxy a acrescentar o segredo partilhado por ele. Esse lado já
 * está fechado (o BFF só encaminha `/api/`); isto fecha o outro, para a
 * especificação também não ficar ao alcance de quem já esteja dentro do
 * perímetro.
 *
 * A verificação é feita no REGISTO da rota, não dentro do handler: uma rota que
 * não existe não tem como ter uma falha de autorização.
 */
const documentacaoActiva = env.get('API_DOCS_ENABLED') ?? !app.inProduction

if (documentacaoActiva) {
  // returns swagger in YAML
  router.get('/swagger', async () => {
    return AutoSwagger.default.docs(router.toJSON(), swagger)
  })

  // Renders Swagger-UI and passes YAML-output of /swagger
  router.get('/docs', async () => {
    return AutoSwagger.default.ui('/swagger', swagger)
    // return AutoSwagger.default.scalar("/swagger"); to use Scalar instead. If you want, you can pass proxy url as second argument here.
    // return AutoSwagger.default.rapidoc("/swagger", "view"); to use RapiDoc instead (pass "view" default, or "read" to change the render-style)
  })
}
