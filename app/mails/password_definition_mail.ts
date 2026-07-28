import { BaseMail } from '@adonisjs/mail'

const FROM = 'noreply.alaragest@bknkv.com'

/**
 * Email enviado quando uma conta é criada com uma palavra-passe temporária
 * (`auth_repository.create()`). Antes desta consolidação, `temporaryPassword` nunca era
 * passado ao template (`password_definition.edge` mostra-o na "credentials-box") — a
 * caixa aparecia sempre vazia, sem forma de o utilizador saber a sua palavra-passe inicial.
 */
export default class PasswordDefinitionMail extends BaseMail {
  constructor(
    private readonly destinatario: string,
    private readonly username: string,
    private readonly companyName: string,
    private readonly temporaryPassword: string,
    private readonly resetUrl: string
  ) {
    super()
  }

  prepare() {
    this.message
      .to(this.destinatario)
      .from(FROM)
      .subject('Sua conta foi criada — Defina sua senha')
      .htmlView('emails/password_definition', {
        user: {
          email: this.destinatario,
          username: this.username,
        },
        company: {
          name: this.companyName,
        },
        temporaryPassword: this.temporaryPassword,
        resetUrl: this.resetUrl,
        year: new Date().getFullYear(),
      })
  }
}
