import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { Secret } from '@adonisjs/core/helpers'
import { defineConfig } from '@adonisjs/core/http'

/**
 * The app key is used for encrypting cookies, generating signed URLs,
 * and by the "encryption" module.
 *
 * The encryption module will fail to decrypt data if the key is lost or
 * changed. Therefore it is recommended to keep the app key secure.
 */
export const appKey = new Secret(env.get('APP_KEY'))

/**
 * The configuration settings used by the HTTP server
 */
export const http = defineConfig({
  generateRequestId: true,
  allowMethodSpoofing: false,

  /**
   * Em que proxies confiar para ler o IP real do cliente a partir do
   * `X-Forwarded-For`. Isto e o que faz `request.ip()` devolver o cliente e nao
   * o Caddy — e portanto o que faz os limitadores por IP em start/limiter.ts
   * contarem a pessoa certa.
   *
   * Este valor era o da omissao do framework, e nao o da nossa escolha. Fica
   * explicito porque uma mudanca de omissao numa versao futura do AdonisJS
   * passaria a contar todos os pedidos como vindos do Caddy, colapsando cada
   * limite por IP num limite global — sem erro nenhum, apenas utilizadores
   * legitimos a serem bloqueados.
   *
   * `loopback` = 127.0.0.1 e ::1, que e onde o Caddy corre neste servidor.
   */
  trustProxy: 'loopback',

  /**
   * Enabling async local storage will let you access HTTP context
   * from anywhere inside your application.
   */
  useAsyncLocalStorage: false,

  /**
   * Manage cookies configuration. The settings for the session id cookie are
   * defined inside the "config/session.ts" file.
   */
  cookie: {
    /**
     * O mesmo caso do config/session.ts: `domain: ''` nao equivale a omitir a
     * propriedade — produz um `Domain=` invalido no Set-Cookie e o browser
     * descarta o cookie. Esta e a configuracao de TODOS os cookies da
     * aplicacao, nao so o de sessao, por isso a correccao anterior estava
     * incompleta.
     *
     * Vem da mesma variavel: o dominio é uma propriedade do sitio, nao de um
     * cookie em particular. Ausente em desenvolvimento; `.taesic.bknkv.com` em
     * producao, para cobrir app. e api.
     */
    domain: env.get('SESSION_COOKIE_DOMAIN'),
    path: '/',
    maxAge: '2h',
    httpOnly: true,
    secure: app.inProduction,
    sameSite: 'lax',
  },
})
