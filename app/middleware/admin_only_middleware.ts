import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { userHasRole } from '../helpers/Utils.js'
import Papel from '#models/auth/papel'

export default class AdminOnlyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const papeis = await Papel.query().where("nome", 'like', "Platform_%")
    const papeisMap = papeis.map(f => f.nome)

    const user = ctx.auth.user!

    const isPlatformAdmin = await userHasRole(user, papeisMap)
    if (!isPlatformAdmin) {
      return ctx.response.forbidden({
        data: null,
        message: 'Acesso restrito a administradores da plataforma',
        status: 403,
      })
    }

    return next()
  }
}
