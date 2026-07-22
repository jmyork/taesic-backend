import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import logger from '@adonisjs/core/services/logger'
import SecurityLog from '#models/security_log'
import { logSecurityEvent } from '../../app/helpers/security_logger.js'

/**
 * `logSecurityEvent` é o ponto único de log estruturado para eventos de segurança
 * (login, autorização, rate limiting) — usado por `auth_controller.login()`,
 * `permission_middleware.ts` e `start/limiter.ts` em vez de `console.log`/`console.error`
 * espalhados. Confirma tanto a forma dos dados passados ao logger pino (sem depender de
 * capturar output real de stdout) como a persistência em `security_logs` — o histórico
 * consultável independente da retenção dos logs de stdout.
 */
test.group('security_logger.logSecurityEvent', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let chamadas: any[] = []
  let infoOriginal: typeof logger.info

  group.each.setup(() => {
    chamadas = []
    infoOriginal = logger.info.bind(logger)
    // Substituição temporária só para este teste, restaurada no teardown.
    logger.info = ((...args: any[]) => chamadas.push(args)) as typeof logger.info
    return () => {
      logger.info = infoOriginal
    }
  })

  test('regista o evento com security_event, os detalhes e uma mensagem legível', async ({ assert }) => {
    logSecurityEvent('login_failed', { uid: 'jmyork', company_alias: 'bknkv' })

    assert.lengthOf(chamadas, 1)
    const [payload, mensagem] = chamadas[0]
    assert.equal(payload.security_event, 'login_failed')
    assert.equal(payload.uid, 'jmyork')
    assert.equal(payload.company_alias, 'bknkv')
    assert.equal(mensagem, '[security] login_failed')
  })

  test('inclui o IP do pedido quando um HttpContext é passado', ({ assert }) => {
    const ctxFalso = { request: { ip: () => '203.0.113.7' } } as any
    logSecurityEvent('permission_denied', { user_id: 'abc' }, ctxFalso)

    const [payload] = chamadas[0]
    assert.equal(payload.ip, '203.0.113.7')
    assert.equal(payload.user_id, 'abc')
  })

  test('não rebenta e não define ip quando nenhum ctx é passado', ({ assert }) => {
    logSecurityEvent('rate_limited', { throttle: 'login' })

    const [payload] = chamadas[0]
    assert.isUndefined(payload.ip)
    assert.equal(payload.throttle, 'login')
  })

  test('persiste o evento em security_logs, além do pino', async ({ assert }) => {
    logSecurityEvent('login_failed', { uid: 'jmyork', company_alias: 'bknkv' })

    // a escrita em BD é fire-and-forget (não bloqueia o pedido) — dar tempo ao
    // microtask/promise da query correr antes de verificar.
    await new Promise((resolve) => setImmediate(resolve))

    const registo = await SecurityLog.query().where('event', 'login_failed').orderBy('created_at', 'desc').firstOrFail()
    assert.equal(registo.event, 'login_failed')
    assert.isNull(registo.ip)
    assert.equal(registo.details?.uid, 'jmyork')
    assert.equal(registo.details?.company_alias, 'bknkv')
  })

  test('persiste o IP quando um HttpContext é passado', async ({ assert }) => {
    const ctxFalso = { request: { ip: () => '203.0.113.7' } } as any
    logSecurityEvent('permission_denied', { user_id: 'abc' }, ctxFalso)

    await new Promise((resolve) => setImmediate(resolve))

    const registo = await SecurityLog.query().where('event', 'permission_denied').orderBy('created_at', 'desc').firstOrFail()
    assert.equal(registo.ip, '203.0.113.7')
    assert.equal(registo.details?.user_id, 'abc')
  })
})
