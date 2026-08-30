import { BaseMail } from '@adonisjs/mail'

import { remetente } from '#mails/remetente'

/**
 * Email enviado quando um administrador cria a conta de um funcionário
 * (`auth_repository.create()`).
 *
 * NÃO leva palavra-passe. O servidor gera uma temporária só para a conta não ficar
 * sem hash até o utilizador definir a sua, mas essa palavra-passe nunca é usada por
 * ninguém — o acesso faz-se sempre pelo `resetUrl`. Enviá-la por email era pôr uma
 * credencial válida a circular em texto simples, sem qualquer benefício.
 */
export default class PasswordDefinitionMail extends BaseMail {
  constructor(
    private readonly destinatario: string,
    private readonly username: string,
    private readonly companyName: string,
    private readonly resetUrl: string
  ) {
    super()
  }

  prepare() {
    this.message
      .to(this.destinatario)
      .from(remetente())
      .subject('A sua conta foi criada — defina a palavra-passe')
      .htmlView('emails/password_definition', {
        user: {
          email: this.destinatario,
          username: this.username,
        },
        company: {
          name: this.companyName,
        },
        resetUrl: this.resetUrl,
        year: new Date().getFullYear(),
      })
  }
}
