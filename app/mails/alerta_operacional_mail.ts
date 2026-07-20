import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'

/**
 * Email genérico para alertas operacionais (estoque crítico, produto perto da validade,
 * venda de alto valor cancelada, reversão de estoque). Uma única Mailable reutilizada por
 * todos os listeners em `app/listeners/estoque_alertas.ts`, em vez de cada caso construir
 * o seu próprio `mail.send((message) => ...)` inline.
 */
export default class AlertaOperacionalMail extends BaseMail {
  constructor(
    private readonly destinatario: string,
    private readonly titulo: string,
    private readonly linhas: string[]
  ) {
    super()
  }

  prepare() {
    this.message
      .to(this.destinatario)
      .from(env.get('MAIL_FROM', 'noreply@alaragest.com'))
      .subject(`[Alerta] ${this.titulo}`)
      .htmlView('emails/alerta_operacional', {
        titulo: this.titulo,
        linhas: this.linhas,
        year: new Date().getFullYear(),
      })
  }
}
