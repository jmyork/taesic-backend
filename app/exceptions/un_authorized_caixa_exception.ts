import { Exception } from '@adonisjs/core/exceptions'
import { HttpContext } from '@adonisjs/core/http'

export default class UnAuthorizedCaixaException extends Exception {
  static status = 500
  static code = 'UNAUTHORIZED_CAIXA'
  static message = 'Unauthorized: You can only close your own Caixa.'

  async handle(error: this, ctx: HttpContext) {
    ctx.response.status(error.status).unauthorized({
      errors: [{ message: error.message, code: error.code }],
    })
  }
}
