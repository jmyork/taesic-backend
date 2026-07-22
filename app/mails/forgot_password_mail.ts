import { BaseMail } from '@adonisjs/mail'

const FROM = 'noreply.alaragest@bknkv.com'

/**
 * Email de recuperação de palavra-passe (`auth_repository.forgot_password()`). Antes desta
 * consolidação, este fluxo reutilizava indevidamente `password_definition.edge` (a view de
 * "conta criada, aqui está a sua palavra-passe temporária") — que nunca fazia sentido para
 * um pedido de reset, e sempre mostrava uma "credentials-box" vazia (sem temporaryPassword).
 * `reset_password.edge` já existia pronta para este caso exacto, mas estava órfã: nada a
 * usava.
 */
export default class ForgotPasswordMail extends BaseMail {
  constructor(
    private readonly destinatario: string,
    private readonly username: string,
    private readonly resetUrl: string
  ) {
    super()
  }

  prepare() {
    this.message
      .to(this.destinatario)
      .from(FROM)
      .subject('Redefina sua senha')
      .htmlView('emails/reset_password', {
        user: {
          email: this.destinatario,
          username: this.username,
        },
        resetUrl: this.resetUrl,
        year: new Date().getFullYear(),
      })
  }
}
