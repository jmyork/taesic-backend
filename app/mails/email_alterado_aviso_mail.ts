import { BaseMail } from '@adonisjs/mail'

const FROM = 'noreply.taesic@bknkv.com'

/**
 * Enviado para o endereço ANTIGO quando o email de um funcionário é alterado
 * (`auth_repository.update()`).
 *
 * É a única forma de uma alteração indevida ser detectada: quem altera o email de um
 * funcionário é um administrador da empresa (permissão `domain_auth.update`), e o
 * endereço novo pode já não pertencer ao dono da conta. O aviso vai para a caixa de
 * correio que ainda é dele, com o endereço novo em claro para poder ser reconhecido
 * (ou denunciado).
 *
 * NÃO leva nenhum link accionável — só informação. Um botão aqui seria mais uma
 * superfície de phishing sem nada que o utilizador possa fazer sozinho: a reposição
 * passa sempre por um administrador.
 */
export default class EmailAlteradoAvisoMail extends BaseMail {
  constructor(
    private readonly destinatario: string,
    private readonly username: string,
    private readonly companyName: string,
    private readonly emailNovo: string
  ) {
    super()
  }

  prepare() {
    this.message
      .to(this.destinatario)
      .from(FROM)
      .subject('O email da sua conta foi alterado — Taesic')
      .htmlView('emails/email_alterado_aviso', {
        user: {
          username: this.username,
          email: this.destinatario,
        },
        company: {
          name: this.companyName,
        },
        emailNovo: this.emailNovo,
        year: new Date().getFullYear(),
      })
  }
}
