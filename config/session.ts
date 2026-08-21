import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, stores } from '@adonisjs/session'

const sessionConfig = defineConfig({
  enabled: true,
  cookieName: 'adonis-session',

  /**
   * When set to true, the session id cookie will be deleted
   * once the user closes the browser.
   */
  clearWithBrowser: false,

  /**
   * Define how long to keep the session data alive without
   * any activity.
   */
  age: '2h',

  /**
   * Configuration for session cookie and the
   * cookie store
   */
  cookie: {
    /**
     * Domínio do cookie de sessão.
     *
     * Em produção o frontend e a API vivem em subdomínios diferentes
     * (app.taesic.bknkv.com e api.taesic.bknkv.com). Sem domínio explícito o
     * cookie fica preso ao host que o emitiu e o frontend nunca o reenvia — daí
     * SESSION_COOKIE_DOMAIN=.taesic.bknkv.com no .env de produção.
     *
     * Em desenvolvimento a variável fica ausente, o valor é undefined e o
     * atributo Domain é omitido, que é o correcto para localhost. Uma string
     * vazia NÃO é equivalente: produz um `Domain=` inválido no Set-Cookie e o
     * browser descarta o cookie inteiro, derrubando a sessão sem dar erro.
     */
    domain: env.get('SESSION_COOKIE_DOMAIN'),
    path: '/',
    httpOnly: true,
    secure: app.inProduction,
    sameSite: 'lax',
  },

  /**
   * The store to use. Make sure to validate the environment
   * variable in order to infer the store name without any
   * errors.
   */
  store: env.get('SESSION_DRIVER'),

  /**
   * List of configured stores. Refer documentation to see
   * list of available stores and their config.
   */
  stores: {
    cookie: stores.cookie(),
  },
})

export default sessionConfig
