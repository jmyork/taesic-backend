import { Exception } from '@adonisjs/core/exceptions'
// import { HttpContext } from '@adonisjs/core/http'

export default class CaixaAlreadyClosedException extends Exception {
  static status = 400
  static code = 'CAIXA_ALREADY_CLOSED'
  static message =
    'The Caixa is already closed. Please open a new Caixa or Reopen It before trying to close it again.'

  // async handle(error: this, ctx: HttpContext) {
  //   ctx.response.badRequest({
  //     errors: [{ message: error.message, code: error.code }],
  //   })
  // }
}
