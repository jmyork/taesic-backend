import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import { frontendBaseUrl } from '../helpers/Utils.js'
import { registarActividade } from '../helpers/activity_logger.js'

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
   * Rota que não existe: uma PESSOA vai para o frontend, um PROGRAMA recebe JSON.
   *
   * O pedido foi feito ao domínio da API. Se veio de alguém que escreveu o
   * endereço na barra do browser, o sítio certo para o pôr é o frontend — é o que
   * é pedido aqui. Mas responder com um redireccionamento a TUDO seria pior do
   * que não fazer nada: o BFF, os testes e qualquer cliente que espere JSON
   * receberiam de repente HTML de uma página, e rebentavam a interpretá-lo em vez
   * de tratarem um 404 — que é um caso normal, previsto e já tratado.
   *
   * Daí as três condições, todas necessárias:
   *
   * 1. `GET`/`HEAD` apenas. Um 302 a um POST leva vários clientes a repetir o
   *    POST no destino — mandaríamos o corpo de um pedido para a página inicial
   *    do frontend. Nenhum outro método é navegação de browser.
   * 2. Fora de `/api`. Tudo o que é API vive sob esse prefixo; um 404 ali é um
   *    erro de integração e tem de continuar a ser legível como JSON.
   * 3. `Accept` a pedir HTML. É o que distingue o browser do `fetch`, que por
   *    omissão nem envia `text/html`.
   *
   * O caminho pedido NÃO é reaproveitado no destino, de propósito. Passá-lo por
   * `new URL(caminho, frontend)` transformaria `//sitio-do-atacante` — uma URL
   * relativa ao protocolo, perfeitamente válida — num redireccionamento para fora
   * do nosso domínio, e um open redirect é exactamente a peça que dá
   * credibilidade a um link de phishing. A raiz do frontend não tem esse
   * problema e serve o mesmo objectivo: a página 404 do frontend faz o resto.
   */
  private rotaInexistente(ctx: HttpContext) {
    const metodo = ctx.request.method().toUpperCase()
    const caminho = ctx.request.url()
    const querHtml = ctx.request.accepts(['json', 'html']) === 'html'
    const ehApi = caminho === '/api' || caminho.startsWith('/api/')

    if ((metodo === 'GET' || metodo === 'HEAD') && !ehApi && querHtml) {
      return ctx.response.redirect(frontendBaseUrl(), false, 302)
    }

    return this.envelope(ctx, 404, 'Rota não encontrada', {
      code: 'E_ROUTE_NOT_FOUND',
      path: caminho,
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

    // Rota inexistente. Tem de ser tratada ANTES do `instanceof Exception`
    // abaixo: `E_ROUTE_NOT_FOUND` é uma `Exception` como as outras, por isso
    // caía lá e devolvia sempre JSON — o ramo `error.status === 404` que existia
    // depois nunca chegava a correr para uma rota não encontrada.
    if (error?.code === 'E_ROUTE_NOT_FOUND') {
      return this.rotaInexistente(ctx)
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
   * Erros e excepções não tratadas ficam registados em `activity_logs`, com
   * `action: 'error'`.
   *
   * ── Só o que NÃO era esperado ────────────────────────────────────────────────
   *
   * As excepções de domínio (`CaixaAlreadyOpen`, `LimiteDoPlano`, `E_ROW_NOT_FOUND`,
   * os erros de validação do VineJS) são o funcionamento normal do sistema a dizer
   * "não pode" — não são avarias. Registá-las aqui encheria a tabela de ruído e
   * enterraria os 500 a sério, que são precisamente o que se procura quando se vem
   * aqui à procura de alguma coisa. A tentativa recusada continua registada pelo
   * `activity_log_middleware`, com o seu código de estado.
   *
   * O que fica é o resto: o `TypeError`, o erro de SQL, o que ninguém previu.
   *
   * ── Porquê aqui e não num try/catch ─────────────────────────────────────────
   *
   * `report()` é chamado pelo AdonisJS para TODA a excepção que chegue ao topo,
   * independentemente do caminho que a produziu. É o único sítio onde a cobertura
   * não depende de alguém se ter lembrado.
   *
   * O `stack` vai no `description` porque é ele que responde à pergunta que se faz
   * três dias depois — "onde é que isto rebentou?" — e sem ele a linha diz que houve
   * um erro sem dizer onde. É cortado à largura da coluna pelo serviço.
   */
  async report(error: unknown, ctx: HttpContext) {
    const erro = error as { status?: number; code?: string; messages?: unknown; stack?: string; message?: string }
    const ehDeNegocio = erro instanceof Exception || Boolean(erro?.messages)

    if (!ehDeNegocio) {
      registarActividade(
        {
          action: 'error',
          subject_type: 'excepcao',
          status_code: erro?.status ?? 500,
          description: [erro?.code, erro?.message, erro?.stack].filter(Boolean).join(' :: '),
        },
        ctx
      )
    }

    return super.report(error, ctx)
  }
}
