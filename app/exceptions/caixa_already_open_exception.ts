import { Exception } from '@adonisjs/core/exceptions'
import { HttpContext } from '@adonisjs/core/http'

export default class CaixaAlreadyOpenException extends Exception {
  static status = 400
  static code = 'CAIXA_ALREADY_OPEN'
  static message =
    'A Caixa is already open for this user. Please close the existing Caixa before opening a new one.'

  async handle(error: this, ctx: HttpContext) {
    ctx.response.badRequest({
      errors: [{ message: error.message, code: error.code }],
    })
  }
}
