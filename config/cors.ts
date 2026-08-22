import env from '#start/env'
import { defineConfig } from '@adonisjs/cors'

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */

/**
 * Que origens de browser podem falar directamente com esta API.
 *
 * Estava `origin: true`, que reflecte QUALQUER origem que peça. Combinado com
 * `credentials: true`, isso diz ao browser que qualquer sítio na Internet pode
 * fazer pedidos credenciados a esta API e ler as respostas.
 *
 * Deixou de ser preciso: o frontend passou a falar com a API a partir do seu
 * próprio servidor (o BFF em alaragest-webpage/src/app/api/bff), e pedidos
 * servidor-a-servidor não passam por CORS de todo. A lista serve para o que
 * ainda precise de aceder pelo browser.
 *
 * `CORS_ORIGINS` aceita várias, separadas por vírgula. Ausente, permite-se tudo
 * em desenvolvimento — onde a porta muda a toda a hora — e nada em produção.
 *
 * Nota: CORS é uma regra que o BROWSER aplica. Não protege a API de um cliente
 * que não seja um browser (curl, uma app nativa, um script). O que protege
 * continua a ser a autenticação e os limitadores em start/limiter.ts.
 */
function origensPermitidas(): string[] | boolean {
  const configurado = env.get('CORS_ORIGINS')?.trim()

  if (configurado) {
    return configurado
      .split(',')
      .map((origem) => origem.trim().replace(/\/+$/, ''))
      .filter((origem) => origem.length > 0)
  }

  return process.env.NODE_ENV !== 'production'
}

const corsConfig = defineConfig({
  enabled: true,
  origin: origensPermitidas(),
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
  headers: true,
  exposeHeaders: [],
  credentials: true,
  maxAge: 90,
})

export default corsConfig
