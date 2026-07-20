import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'

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

  private envelope(ctx: HttpContext, status: number, message: string, extra?: Record<string, any>) {
    return ctx.response.status(status).json({
      data: null,
      message,
      status,
      ...extra,
    })
  }

  /**
   * Regra única para todas as exceções da aplicação, em vez de cada controller repetir
   * `if (error.code === 'X') {...}` a mão em cada acção (era o padrão em todos os
   * controllers gerados). `app/exceptions/*` — as ~19 exceções de domínio (CaixaAlreadyOpen,
   * CupomInvalido, UserNotInCompany, etc.) — e o `E_ROW_NOT_FOUND` do Lucid partilham a
   * mesma base `Exception` do `@adonisjs/core` (`static status`/`code`/`message`), por isso
   * um único `instanceof Exception` cobre todas sem listar cada uma. Um controller só
   * precisa de continuar a apanhar um erro explicitamente se quiser fazer algo diferente
   * do envelope de erro padrão (ex.: reverter algo antes de responder).
   */
  async handle(error: any, ctx: HttpContext) {
    // Validação (VineJS) — tem uma forma própria (`messages`), não é uma `Exception`.
    if (error.messages) {
      return this.envelope(ctx, 400, 'Dados inválidos', { errors: error.messages })
    }

    if (error instanceof Exception) {
      return this.envelope(ctx, error.status ?? 500, error.message, error.code ? { code: error.code } : undefined)
    }

    if (error.status === 404) {
      return this.envelope(ctx, 404, 'Rota não encontrada', { path: ctx.request.url() })
    }

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
