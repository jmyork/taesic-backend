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
 * Não há aqui nenhuma rota de plataforma. Zero.
 *
 * `papel`, `permissao`, `papel_permissao`, `user_papel`, `plano`, `taxa_iva`,
 * `relatorios_plataforma` e as acções de suspender/reactivar uma empresa mudaram-se
 * para `taesic-backoffice-api`, por decisão do dono do produto: os endpoints da
 * plataforma vivem no backend do backoffice.
 *
 * A ÚLTIMA a sair foi `platform_cupom`, e vale a pena registar porquê.
 *
 * Estava assinalada há muito como premissa por confirmar: dizia-se que era o CRUD
 * dos cupões de quem promove a PLATAFORMA e ganha sobre assinaturas, mas o que
 * fazia era CRUD **cross-tenant sobre a tabela `cupom` dos inquilinos** — a que
 * desconta produtos dentro de uma loja e cujo `cupom_id` só aparece em `vendas`.
 * Levá-la para o backoffice teria sido mudar a coisa errada com o nome certo: dava
 * ao dono da plataforma uma consola para editar os descontos dos clientes dele.
 *
 * A funcionalidade que faltava existe agora, e nasceu onde devia: tabelas próprias
 * (`plataforma_cupom`, `plataforma_cupom_uso`, criadas pela migração
 * `create_plataforma_cupom` — este projecto continua a ser o dono do esquema) e
 * rotas no `taesic-backoffice-api`. Os cupões dos inquilinos continuam onde sempre
 * estiveram, em `api/:company_alias/cupom` (`domain_cupom`), geridos por cada
 * empresa.
 *
 * `AdminOnlyMiddleware` e `userHasPlatformRole()` FICAM, ao contrário do que a nota
 * anterior previa. Não é esquecimento: a definição de "papel de plataforma" é
 * `papel.escopo = 'plataforma'` na tabela `papel`, que os dois projectos partilham,
 * e é aqui que vivem os testes que a guardam — `admin_only_middleware.spec.ts` e a
 * verificação de escalada de privilégios em `papel_por_empresa.spec.ts`. Apagar o
 * helper obrigava a apagar esses testes, e trocar uma rota a menos por uma defesa
 * a menos não é arrumação. O middleware fica registado no kernel, sem rota a usá-lo
 * neste projecto — é barato, e está testado.
 */

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
