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

    try {
      // const empresa = await Empresa.findBy('company_alias', company_alias)
      // //console.log('Empresa encontrada:', empresa)

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
    } catch (error) {
      // console.error('Erro ao validar alias da empresa:', error)
      return ctx.response.notFound({
        data: null,
        message: 'Rota Não Encontrada!',
      })
    }
    return next()
  }
}
