import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'

/**
 * Envio de email — Resend.
 *
 * Substitui o SMTP anterior, que em desenvolvimento apontava para o Mailpit local
 * (`localhost:1025`): os emails ficavam presos na caixa de teste da máquina e nunca
 * chegavam a ninguém, e em produção obrigava a manter credenciais de um servidor SMTP.
 *
 * `RESEND_API_KEY` é obrigatória (ver start/env.ts) — sem ela a aplicação não arranca, o
 * que é preferível a arrancar e falhar silenciosamente em cada email de activação ou de
 * recuperação de palavra-passe.
 *
 * O remetente tem de ser um domínio verificado na Resend; em `MAIL_FROM` guarda-se o
 * endereço completo (ex.: `Taesic <nao-responder@o-teu-dominio.ao>`).
 */
const mailConfig = defineConfig({
  default: 'resend',

  mailers: {
    resend: transports.resend({
      key: env.get('RESEND_API_KEY'),
      baseUrl: env.get('RESEND_BASE_URL') ?? 'https://api.resend.com',
    }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
