/*
|--------------------------------------------------------------------------
| Define HTTP limiters
|--------------------------------------------------------------------------
|
| The "limiter.define" method creates an HTTP middleware to apply rate
| limits on a route or a group of routes. Feel free to define as many
| throttle middleware as needed.
|
*/

import limiter from '@adonisjs/limiter/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import type { HttpLimiter } from '@adonisjs/limiter'
import { logSecurityEvent } from '../app/helpers/security_logger.js'

export const throttle = limiter.define('global', () => {
  return limiter.allowRequests(10).every('1 minute')
})

/**
 * Limitadores aplicados às rotas públicas mais visadas por brute-force/enumeração/spam
 * (login, registo de conta, recuperação de password, OTP de promotor). A chave por
 * omissão é o IP do pedido (ver `HttpLimiter` — só se sobrescreve com `.usingKey()`
 * quando faz sentido isolar por outra dimensão, o que nenhum destes casos precisa).
 * Cada bloqueio fica registado via `logSecurityEvent` — picos de "rate_limited" para o
 * mesmo IP/rota são o sinal mais directo de um ataque em curso.
 */
function comLogDeBloqueio(nome: string, ctx: HttpContext, httpLimiter: HttpLimiter<any>) {
  return httpLimiter.limitExceeded(() => {
    logSecurityEvent('rate_limited', { throttle: nome, route: ctx.route?.name }, ctx)
  })
}

/** Login: credenciais erradas repetidas são o alvo clássico de brute-force. */
export const loginThrottle = limiter.define('login', (ctx) => {
  return comLogDeBloqueio('login', ctx, limiter.allowRequests(5).every('1 minute').blockFor('5 minutes'))
})

/** Criação pública de conta/empresa — sem isto, um script cria contas indefinidamente. */
export const signupThrottle = limiter.define('signup', (ctx) => {
  return comLogDeBloqueio('signup', ctx, limiter.allowRequests(5).every('10 minutes'))
})

/**
 * Pedidos que disparam um email (recuperação de password, reenvio de activação) e a
 * submissão do próprio reset — sem isto, dá para fazer "email bombing" a uma conta
 * alheia só sabendo o email/company_alias.
 */
export const emailActionThrottle = limiter.define('email_action', (ctx) => {
  return comLogDeBloqueio('email_action', ctx, limiter.allowRequests(5).every('5 minutes'))
})

/** Pedir um código OTP (envia SMS/email) — limite mais apertado do que confirmar. */
export const otpRequestThrottle = limiter.define('otp_request', (ctx) => {
  return comLogDeBloqueio('otp_request', ctx, limiter.allowRequests(3).every('5 minutes'))
})

/** Confirmar OTP — o código tem só 6 dígitos; sem isto dá para brute-force em minutos. */
export const otpConfirmThrottle = limiter.define('otp_confirm', (ctx) => {
  return comLogDeBloqueio(
    'otp_confirm',
    ctx,
    limiter.allowRequests(10).every('10 minutes').blockFor('10 minutes')
  )
})