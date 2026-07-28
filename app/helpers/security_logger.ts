import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'
import SecurityLog from '#models/security_log'

/**
 * Log estruturado de eventos de segurança (login, autorização, rate limiting) — via o
 * logger pino já configurado em config/logger.ts (JSON estruturado em produção, pretty
 * em dev), em vez dos `console.error`/`console.log` de debug espalhados pelo resto do
 * código. Separar estes eventos por `security_event` permite filtrar/alertar sobre picos
 * de falhas de login ou de autorização sem depender de parsear texto livre.
 *
 * Além do pino (que em produção só fica em stdout, sujeito à retenção dos logs da
 * infraestrutura), cada evento é também persistido em `security_logs` — histórico
 * consultável independentemente de onde/por quanto tempo os logs de stdout são
 * guardados. A escrita em BD é "fire-and-forget": nunca deve atrasar nem partir o
 * pedido que originou o evento, por isso falhas aí só são registadas via pino, nunca
 * propagadas ao chamador.
 */
export function logSecurityEvent(
  event: string,
  details: Record<string, unknown>,
  ctx?: HttpContext
) {
  const ip = ctx?.request.ip()

  logger.info(
    {
      security_event: event,
      ip,
      ...details,
    },
    `[security] ${event}`
  )

  SecurityLog.create({ event, ip: ip ?? null, details }).catch((error) => {
    logger.error(
      { err: error, security_event: event },
      '[security] falha ao persistir evento em security_logs'
    )
  })
}
