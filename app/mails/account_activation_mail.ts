import { BaseMail } from '@adonisjs/mail'

const FROM = 'noreply.alaragest@bknkv.com'

/**
 * Email de activação de conta — enviado quando uma empresa é registada
 * (`empresa_controller.create_account_with_detalhes`) e quando o token de verificação é
 * reenviado (`resend_verification_email`). Ambos partilhavam o mesmo `mail.send((message)
 * => ...)` inline com a mesma view e forma de dados; consolidado numa única Mailable.
 */
export default class AccountActivationMail extends BaseMail {
  constructor(
    private readonly destinatario: string,
    private readonly firstName: string,
    private readonly companyName: string,
    private readonly verifyUrl: string
  ) {
    super()
  }

  prepare() {
    this.message
      .to(this.destinatario)
      .from(FROM)
      .subject('Welcome to our app | Activation Email')
      .htmlView('emails/account_activation', {
        user: {
          firstName: this.firstName,
          email: this.destinatario,
          companyName: this.companyName,
        },
        verifyUrl: this.verifyUrl,
        year: new Date().getFullYear(),
      })
  }
}
