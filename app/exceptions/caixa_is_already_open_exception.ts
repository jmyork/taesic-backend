import { Exception } from '@adonisjs/core/exceptions'
import { HttpContext } from '@adonisjs/core/http'

export default class CaixaIsAlreadyOpenException extends Exception {
  static status = 500
  static code = 'CAIXA_IS_ALREADY_OPEN'
  static message = 'This Caixa is already open'

  async handle(error: this, ctx: HttpContext) {
    ctx.response.badRequest({
      errors: [{ message: error.message, code: error.code }],
    })
  }
}
