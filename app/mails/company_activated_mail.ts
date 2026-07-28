import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'

/**
 * Email de boas-vindas enviado quando uma empresa é activada (listener de
 * `EmpresaActivated`). O template (`company_activated.edge`) usa
 * `{{ password_definition_url }}` no botão principal, mas o listener nunca o passava —
 * o botão "Aceder à plataforma" ficava sempre sem destino.
 */
export default class CompanyActivatedMail extends BaseMail {
  constructor(
    private readonly destinatario: string,
    private readonly userName: string,
    private readonly companyName: string,
    private readonly passwordDefinitionUrl: string
  ) {
    super()
  }

  prepare() {
    this.message
      .to(this.destinatario)
      .from(env.get('MAIL_FROM', 'noreply@alaragest.com'))
      .subject('Sua empresa foi ativada com sucesso!')
      .htmlView('emails/company_activated', {
        companyName: this.companyName,
        userName: this.userName,
        password_definition_url: this.passwordDefinitionUrl,
        year: new Date().getFullYear(),
      })
  }
}
