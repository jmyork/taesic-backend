import { BaseMail } from '@adonisjs/mail'

import { remetente } from '#mails/remetente'

/** Email com o código OTP de acesso ao painel de promotor (`promotor_auth_repository.pedirOtp()`). */
export default class PromotorOtpMail extends BaseMail {
  constructor(
    private readonly destinatario: string,
    private readonly nome: string,
    private readonly codigo: string
  ) {
    super()
  }

  prepare() {
    this.message
      .to(this.destinatario)
      .from(remetente())
      .subject('O seu código de acesso — Taesic')
      .htmlView('emails/promotor_otp', {
        nome: this.nome,
        codigo: this.codigo,
        year: new Date().getFullYear(),
      })
  }
}
