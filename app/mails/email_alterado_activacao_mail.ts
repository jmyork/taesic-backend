import { BaseMail } from '@adonisjs/mail'

import { remetente } from '#mails/remetente'

/**
 * Enviado para o NOVO endereço quando o email de um funcionário é alterado
 * (`auth_repository.update()`).
 *
 * A conta fica bloqueada até este link ser aberto: a alteração invalida a verificação
 * anterior, por isso o `login` (que exige um `verification_token_hash` verificado) só
 * volta a funcionar depois da activação. Sem este email o funcionário ficaria sem
 * forma nenhuma de reentrar.
 *
 * NÃO é o `AccountActivationMail`: aquele é o registo de uma empresa nova ("bem-vindo,
 * active a sua conta") e não explica a razão — aqui o que interessa dizer é que o
 * endereço mudou, qual era o anterior, e que só a confirmação repõe o acesso.
 */
export default class EmailAlteradoActivacaoMail extends BaseMail {
  constructor(
    private readonly destinatario: string,
    private readonly username: string,
    private readonly companyName: string,
    private readonly emailAnterior: string,
    private readonly verifyUrl: string
  ) {
    super()
  }

  prepare() {
    this.message
      .to(this.destinatario)
      .from(remetente())
      .subject('Confirme o seu novo email — Taesic')
      .htmlView('emails/email_alterado_activacao', {
        user: {
          username: this.username,
          email: this.destinatario,
        },
        company: {
          name: this.companyName,
        },
        emailAnterior: this.emailAnterior,
        verifyUrl: this.verifyUrl,
        year: new Date().getFullYear(),
      })
  }
}
