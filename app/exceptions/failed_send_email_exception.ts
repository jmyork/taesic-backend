import { Exception } from '@adonisjs/core/exceptions'
import { HttpContext } from '@adonisjs/core/http'

export default class FailedSendEmailException extends Exception {
  static status = 400
  static code = 'E_SEND_EMAIL_FAILURE'

  async handle(error: this, ctx: HttpContext) {
    ctx.response.status(error.status).send({
      errors: [{ message: error.message, code: error.code }],
    })
  }
}
