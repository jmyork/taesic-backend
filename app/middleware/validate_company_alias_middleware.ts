import { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'

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
    const empresa = await db
      .from('user')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .join('verification_token_hash', 'verification_token_hash.user_id', 'user.id')
      .where('empresa.company_alias', company_alias)
      .where('verification_token_hash.verified', true)
      .where('user.id', ctx.auth.user?.id!)
      .first()

    if (!empresa) {
      return ctx.response.notFound({
        data: null,
        message: `Empresa com alias "${company_alias}" não encontrada`,
      })
    }
    return next()
  }
}
