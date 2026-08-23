import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { userHasPlatformRole } from '../helpers/Utils.js'
import { logSecurityEvent } from '../helpers/security_logger.js'

/**
 * Portão do backoffice: só quem tem um papel de PLATAFORMA passa.
 *
 * Isto verificava `nome LIKE 'Platform_%'`. Enquanto `papel.nome` era único
 * globalmente e só o dono da plataforma criava papéis, funcionava. Deixou de
 * funcionar no momento em que cada empresa passou a poder criar os seus: a
 * unicidade passou a ser por empresa, portanto uma empresa podia criar um papel
 * chamado `Platform_Admin`, atribuí-lo a si própria e entrar aqui — escalando de
 * inquilino a administrador da plataforma, com acesso cross-tenant a tudo.
 *
 * A verificação passou a ser sobre `papel.escopo`, uma coluna que nenhum
 * inquilino consegue pôr a `plataforma`: a criação por empresa força
 * `escopo = 'empresa'` e a base de dados recusa a combinação contrária
 * (`papel_escopo_empresa_chk`). O nome deixou de decidir autorização.
 */
export default class AdminOnlyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user!

    if (!(await userHasPlatformRole(user))) {
      // Uma tentativa de entrar no backoffice sem o ser é sinal, não ruído: é o
      // que se quer ver num registo quando alguma coisa corre mal.
      logSecurityEvent('platform_access_denied', { user_id: user.id, route: ctx.route?.name }, ctx)

      return ctx.response.forbidden({
        data: null,
        message: 'Acesso restrito a administradores da plataforma',
        status: 403,
      })
    }

    return next()
  }
}
