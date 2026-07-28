import { DateTime } from 'luxon'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import mail from '@adonisjs/mail/services/main'
import PromotorOtpMail from '#mails/promotor_otp_mail'
import Promotor from '#models/promotor'
import PromotorOtp from '#models/promotor_otp'
import PromotorAccessToken from '#models/promotor_access_token'

const OTP_TTL_MINUTOS = 10
const TOKEN_TTL_HORAS = 24

/** Tokens de acesso são strings de alta entropia — usar SHA-256 (rápido, determinístico) para
 * permitir procurar diretamente por hash. Já os códigos OTP de 6 dígitos são de baixa entropia
 * e podem ser pedidos por humanos, por isso usam o `hash` (scrypt) mais lento, o mesmo usado
 * para passwords — a defesa real aqui vem da expiração curta + uso único, não do algoritmo. */
function sha256(valor: string): string {
  return createHash('sha256').update(valor).digest('hex')
}

export default class PromotorAuthRepository {
  async pedirOtp(email: string): Promise<void> {
    const promotor = await Promotor.query().where('email', email.trim().toLowerCase()).whereNull('deleted_at').first()
    // Não revela se o email existe ou não — resposta do controller é sempre genérica.
    if (!promotor || !promotor.ativo) return

    // No máximo um OTP ativo de cada vez por promotor, simplifica a confirmação.
    await PromotorOtp.query().where('promotor_id', promotor.id).whereNull('used_at').delete()

    const codigo = String(randomInt(100000, 1000000))
    const codigo_hash = await hash.make(codigo)

    await PromotorOtp.create({
      promotor_id: promotor.id,
      codigo_hash,
      expires_at: DateTime.now().plus({ minutes: OTP_TTL_MINUTOS }),
      used_at: null,
    })

    await mail.send(new PromotorOtpMail(promotor.email, promotor.nome, codigo))
  }

  /** Devolve o token de acesso em claro (só existe este momento) ou `null` se o OTP for inválido/expirado/usado. */
  async confirmarOtp(email: string, codigo: string): Promise<{ token: string; promotor: Promotor } | null> {
    const promotor = await Promotor.query().where('email', email.trim().toLowerCase()).whereNull('deleted_at').first()
    if (!promotor || !promotor.ativo) return null

    const otp = await PromotorOtp.query()
      .where('promotor_id', promotor.id)
      .whereNull('used_at')
      .where('expires_at', '>=', DateTime.now().toSQL()!)
      .orderBy('created_at', 'desc')
      .first()
    if (!otp) return null

    const valido = await hash.verify(otp.codigo_hash, codigo)
    if (!valido) return null

    otp.used_at = DateTime.now()
    await otp.save()

    const tokenPublico = randomBytes(32).toString('hex')
    await PromotorAccessToken.create({
      promotor_id: promotor.id,
      token_hash: sha256(tokenPublico),
      expires_at: DateTime.now().plus({ hours: TOKEN_TTL_HORAS }),
    })

    return { token: tokenPublico, promotor }
  }

  async promotorPorToken(token: string): Promise<Promotor | null> {
    const registo = await PromotorAccessToken.query()
      .where('token_hash', sha256(token))
      .where('expires_at', '>=', DateTime.now().toSQL()!)
      .first()
    if (!registo) return null

    return Promotor.query().where('id', registo.promotor_id).whereNull('deleted_at').first()
  }
}
