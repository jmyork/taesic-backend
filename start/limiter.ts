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

/**
 * A escolha da CHAVE de cada limitador.
 *
 * A chave por omissão é o IP do pedido. Para alguns destes casos isso é a coisa
 * errada, e não por causa de proxies — por causa de quem se está a proteger:
 *
 * - Brute-force a UMA conta, distribuído por muitos IPs, nunca chegava a atingir
 *   um limite por IP. O alvo é a conta, logo a chave tem de ser a conta.
 * - "Email bombing" a uma caixa de correio alheia: quem sofre é a vítima, não o
 *   atacante. Limitar por IP do atacante não protege a vítima de vários
 *   atacantes; limitar por email de destino protege-a de todos.
 *
 * Onde o que se protege É um recurso global — criação em massa de contas, o
 * portal do Minfin atrás da consulta de NIF — a chave por IP continua a certa e
 * fica como está.
 *
 * NOTA PARA UM FUTURO BFF: se o frontend passar a falar com esta API a partir do
 * servidor Next em vez do browser, os limitadores que continuam por IP passam a
 * ver um só IP para toda a plataforma. O proxy TEM de reencaminhar o
 * `X-Forwarded-For` do cliente original — o `trustProxy` em config/app.ts confia
 * em loopback, por isso o valor reencaminhado é respeitado. Os limitadores
 * abaixo que usam `.usingKey()` são indiferentes a isso, de propósito.
 *
 * O `espaco` É UM PARÂMETRO À PARTE, E NÃO MAIS UMA PARTE. Isto não é
 * arrumação — era o bug.
 *
 * A assinatura anterior era `chaveDoAlvo(ctx, ...partes)` e todos os chamadores
 * passavam o nome do espaço ('login', 'email_action', ...) como primeira parte.
 * Como esse nome é uma constante e nunca vem vazio, sobrevivia sempre ao
 * `filter`, `identificado.length` nunca era zero, e o ramo do IP era código
 * morto — nunca correu uma única vez.
 *
 * A consequência: um pedido em que nenhuma parte identificava o alvo (campo com
 * outro nome, corpo em falta, corpo que a validação ainda vai recusar) produzia
 * a chave `email_action`, igual para toda a gente. O contador deixava de ser por
 * pessoa e passava a ser um contador ÚNICO da plataforma inteira: bastavam 5
 * pedidos, de quem quer que fossem, para o 6.º utilizador do mundo levar 429 — e
 * o seguinte, e o seguinte. Era exactamente o sintoma relatado: "todos os
 * dispositivos são barrados pelo mesmo erro".
 *
 * E não era teórico. Em `api/resend-company-activation-email` a rota não tem
 * `:company_alias` no caminho e o corpo chama-se `nif_ou_company_alias` (ver
 * ResendVerificationEmailValidator), por isso as três partes que o
 * `emailActionThrottle` procurava vinham TODAS indefinidas. Aquela rota estava,
 * na prática, com um limite global de 5 pedidos por 5 minutos para o planeta.
 *
 * Com o espaço fora da lista, uma chave sem alvo cai no IP. O limite continua a
 * existir — quem faz o disparate continua a pagá-lo —, mas paga-o sozinho.
 */
function chaveDoAlvo(
  ctx: HttpContext,
  espaco: string,
  ...partes: (string | undefined | null)[]
): string {
  const identificado = partes
    .map((parte) => (parte ?? '').toString().trim().toLowerCase())
    .filter((parte) => parte.length > 0)

  // Sem nada que identifique o alvo (pedido malformado, validação ainda por
  // correr), cai no IP em vez de ficar sem chave — nunca desligar o limite, mas
  // também nunca o transformar num limite global.
  return identificado.length > 0
    ? `${espaco}|${identificado.join('|')}`
    : `${espaco}|ip:${ctx.request.ip()}`
}

export const throttle = limiter.define('global', () => {
  return limiter.allowRequests(10).every('1 minute')
})

/**
 * Limitadores aplicados às rotas públicas mais visadas por brute-force/enumeração/spam
 * (login, registo de conta, recuperação de password, OTP de promotor). Cada bloqueio fica
 * registado via `logSecurityEvent` — picos de "rate_limited" para a mesma chave/rota são o
 * sinal mais directo de um ataque em curso.
 */
function comLogDeBloqueio(nome: string, ctx: HttpContext, httpLimiter: HttpLimiter<any>) {
  return httpLimiter.limitExceeded(() => {
    logSecurityEvent('rate_limited', { throttle: nome, route: ctx.route?.name }, ctx)
  })
}

/**
 * Login, por CONTA: credenciais erradas repetidas contra a mesma conta, venham de
 * onde vierem. É o limite que trava o brute-force a um alvo concreto.
 */
export const loginThrottle = limiter.define('login', (ctx) => {
  return comLogDeBloqueio(
    'login',
    ctx,
    limiter
      .allowRequests(5)
      .every('1 minute')
      .blockFor('5 minutes')
      .usingKey(
        chaveDoAlvo(ctx, 'login', ctx.request.input('company_alias'), ctx.request.input('uid'))
      )
  )
})

/**
 * Login, por ORIGEM: complementa o de cima. Sem isto, um atacante escapava ao
 * limite por conta simplesmente pulverizando muitas contas diferentes — cada uma
 * com poucas tentativas. Mais folgado, porque um escritório inteiro atrás do
 * mesmo NAT partilha este contador.
 *
 * Os dois aplicam-se à mesma rota: ver start/routes.ts.
 */
export const loginIpThrottle = limiter.define('login_ip', (ctx) => {
  return comLogDeBloqueio(
    'login_ip',
    ctx,
    limiter.allowRequests(20).every('1 minute').blockFor('5 minutes')
  )
})

/** Criação pública de conta/empresa — sem isto, um script cria contas indefinidamente. */
export const signupThrottle = limiter.define('signup', (ctx) => {
  return comLogDeBloqueio('signup', ctx, limiter.allowRequests(5).every('10 minutes'))
})

/**
 * Pedidos que disparam um email (recuperação de password, reenvio de activação) e a
 * submissão do próprio reset — sem isto, dá para fazer "email bombing" a uma conta
 * alheia só sabendo o email/company_alias.
 *
 * A chave é a CONTA DE DESTINO, não a origem: é a vítima que se está a proteger.
 *
 * O `nif_ou_company_alias` faz parte da lista porque é o ÚNICO campo que
 * identifica o alvo em `api/resend-company-activation-email` — a rota não tem
 * `:company_alias` no caminho e o corpo não traz `email` nem `uid` (ver
 * ResendVerificationEmailValidator em app/validators/empresa_validator.ts). Sem
 * ele, TODOS os pedidos de reenvio partilhavam a mesma chave, e o limite de 5
 * por 5 minutos era um limite da plataforma inteira em vez de um limite por
 * empresa.
 *
 * Cada rota que passe a usar este limitador tem de trazer pelo menos um destes
 * campos. Se não trouxer, o limite ainda funciona — cai no IP, ver
 * `chaveDoAlvo` — mas deixa de proteger a vítima, que é o ponto do limitador.
 * O teste em tests/functional/limiter_chaves.spec.ts trava a regressão.
 */
export const emailActionThrottle = limiter.define('email_action', (ctx) => {
  return comLogDeBloqueio(
    'email_action',
    ctx,
    limiter
      .allowRequests(5)
      .every('5 minutes')
      .usingKey(
        chaveDoAlvo(
          ctx,
          'email_action',
          ctx.params?.company_alias,
          ctx.request.input('email') ??
            ctx.request.input('uid') ??
            ctx.request.input('nif_ou_company_alias')
        )
      )
  )
})

/**
 * Consulta pública de NIF (usada no registo de empresa, antes de haver conta).
 *
 * Precisa de limite próprio por dois motivos: cada consulta que não esteja em cache
 * dispara um pedido ao portal do Estado — não podemos servir de amplificador contra o
 * Minfin — e sem limite o endpoint torna-se um raspador aberto do registo nacional de
 * contribuintes. Mais folgado do que o `signup` porque, ao preencher o formulário, é
 * legítimo consultar/corrigir o NIF algumas vezes.
 *
 * Fica por IP de propósito: o que se protege aqui é um recurso de terceiros, e a chave
 * por alvo (o NIF consultado) seria trivial de contornar rodando NIFs.
 */
export const nifPublicThrottle = limiter.define('nif_publico', (ctx) => {
  return comLogDeBloqueio('nif_publico', ctx, limiter.allowRequests(15).every('10 minutes'))
})

/**
 * Pedir um código OTP (envia SMS/email) — limite mais apertado do que confirmar.
 * Chave: o email de destino. Como no email_action, é a caixa de correio da pessoa
 * que se protege de ser inundada.
 */
export const otpRequestThrottle = limiter.define('otp_request', (ctx) => {
  return comLogDeBloqueio(
    'otp_request',
    ctx,
    limiter
      .allowRequests(3)
      .every('5 minutes')
      .usingKey(chaveDoAlvo(ctx, 'otp_request', ctx.request.input('email')))
  )
})

/**
 * Confirmar OTP — o código tem só 6 dígitos; sem isto dá para brute-force em minutos.
 * Chave: o email em causa. Um atacante a adivinhar o código de UMA pessoa fica preso
 * mesmo que mude de IP a cada tentativa, que é precisamente o ataque que interessa.
 */
export const otpConfirmThrottle = limiter.define('otp_confirm', (ctx) => {
  return comLogDeBloqueio(
    'otp_confirm',
    ctx,
    limiter
      .allowRequests(10)
      .every('10 minutes')
      .blockFor('10 minutes')
      .usingKey(chaveDoAlvo(ctx, 'otp_confirm', ctx.request.input('email')))
  )
})
