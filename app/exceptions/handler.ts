import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
// import type { StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'
import CaixaAlreadyClosedException from './caixa_already_closed_exception.js'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages are used to display a custom HTML pages for certain error
   * codes. You might want to enable them in production only, but feel
   * free to enable them in development as well.
   */
  protected renderStatusPages = app.inProduction

  /**
   * Status pages is a collection of error code range and a callback
   * to return the HTML contents to send as a response.
   */
  // protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
  //   '404': (error, { inertia }) => inertia.render('errors/not_found', { error }),
  //   '500..599': (error, { inertia }) => inertia.render('errors/server_error', { error }),
  // }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */

  private errorResponse(ctx: HttpContext, status: number, message: string, code?: string) {
    return ctx.response.status(status).json({
      success: false,
      message,
      code,
    })
  }
  async handle(error: any, ctx: HttpContext) {
    if (error.status === 404) {
      return ctx.response.status(404).json({
        message: 'Rota não encontrada',
        path: ctx.request.url(),
      })
    }

    if (error instanceof CaixaAlreadyClosedException) {
      return this.errorResponse(ctx, error.status, error.message, error.code)
    }

    // if(error instanceof errors.E_INVALID_CREDENTIALS)
    // if(error instanceof errorValidation.E_VALIDATION_ERROR)
    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
