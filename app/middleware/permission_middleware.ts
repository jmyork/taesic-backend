import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { userHasPermission } from '../helpers/Utils.js'

// depois usar cache para aumentar a performance.
export default class PermissionMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth?.user

    if (!user) {
      return ctx.response.unauthorized({
        message: 'User not authenticated',
      })
    }

    const routeName = ctx.route?.name
    console.log(routeName)

    //console.log(routeName)
    if (!routeName) {
      return ctx.response.forbidden({
        message: 'Route without permission mapping',
      })
    }

    const hasPermission = await userHasPermission(user, routeName)

    if (!hasPermission) {
      return ctx.response.forbidden({
        message: 'Unauthorized Operation',
      })
    }

    return next()
  }
}
