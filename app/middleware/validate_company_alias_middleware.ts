import { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'
import { logSecurityEvent } from '../helpers/security_logger.js'

export default class ValidateCompanyAliasMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { company_alias } = ctx.params

    if (!company_alias) {
      return ctx.response.badRequest({
        data: null,
        message: 'Alias da empresa não fornecido',
      })
    }

    // Sem try/catch: uma empresa/alias inexistente devolve `undefined` de `.first()` (tratado
    // abaixo como 404), nunca lança. Deixar qualquer erro inesperado (BD em baixo, etc.)
    // propagar para o exception handler global — apanhá-lo aqui e responder sempre 404
    // "Rota Não Encontrada" escondia falhas reais de infraestrutura atrás de uma mensagem
    // enganosa, tornando-as quase impossíveis de diagnosticar em produção.
    // `select` explícito em vez do `*` implícito: sem ele a linha vinha com as colunas
    // das três tabelas achatadas num só objecto, e `suspensa_em` só não colidia com
    // nada por sorte (`deleted_at`, esse, existe em todas). Nada aqui usa o resto.
    const empresa = await db
      .from('user')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .join('verification_token_hash', 'verification_token_hash.user_id', 'user.id')
      .where('empresa.company_alias', company_alias)
      .where('verification_token_hash.verified', true)
      .where('user.id', ctx.auth.user?.id!)
      .select('empresa.id as empresa_id', 'empresa.suspensa_em as suspensa_em')
      .first()

    if (!empresa) {
      return ctx.response.notFound({
        data: null,
        message: `Empresa com alias "${company_alias}" não encontrada`,
      })
    }

    // A empresa está suspensa: aqui é que a suspensão deixa de ser decorativa.
    //
    // Este é o portão por onde passam TODAS as rotas de inquilino
    // (`api/:company_alias/...`), portanto uma única verificação cobre o produto
    // inteiro — vender, facturar, gerir stock, tudo. A alternativa seria repeti-la
    // por repositório, e bastaria esquecer um.
    //
    // 403 e não 404: quem bate à porta é o próprio inquilino, e fingir que a empresa
    // não existe transformaria um corte deliberado num "a aplicação avariou" — que
    // acaba num pedido de suporte em vez de num telefonema a tratar da causa. O motivo
    // gravado NÃO vai na resposta; esse é para o backoffice e para quem for falar com o
    // cliente.
    if (empresa.suspensa_em) {
      logSecurityEvent(
        'empresa_suspensa_acesso_negado',
        {
          user_id: ctx.auth.user?.id,
          empresa_id: empresa.empresa_id,
          company_alias,
          route: ctx.route?.name,
        },
        ctx
      )

      return ctx.response.forbidden({
        data: null,
        message: 'Esta empresa está suspensa. Contacte o suporte da plataforma.',
        status: 403,
        code: 'EMPRESA_SUSPENSA',
      })
    }

    return next()
  }
}
