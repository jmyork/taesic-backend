import { BaseMail } from '@adonisjs/mail'

const FROM = 'noreply.alaragest@bknkv.com'

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
      .from(FROM)
      .subject('O seu código de acesso — Alaragest')
      .htmlView('emails/promotor_otp', { nome: this.nome, codigo: this.codigo })
  }
}
