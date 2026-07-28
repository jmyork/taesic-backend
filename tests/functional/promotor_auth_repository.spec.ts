import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import PromotorRepository from '#repositories/promotor_repository'
import PromotorAuthRepository from '#repositories/promotor_auth_repository'
import PromotorOtp from '#models/promotor_otp'
import PromotorOtpMail from '#mails/promotor_otp_mail'

/**
 * Extrai o código OTP de 6 dígitos do último email capturado pelo mail.fake(). Desde que
 * `pedirOtp` passou a enviar via `PromotorOtpMail` (Mailable), o fake mailer já não regista
 * isto em `fakeMailer.messages` (só usado para o estilo `mail.send((message) => ...)`) —
 * instâncias de `BaseMail` ficam em `fakeMailer.mails`, e o `Message` real (com
 * `contentViews`) fica um nível abaixo, em `mail.message`.
 */
function extrairCodigoDoUltimoEmail(): string {
  const enviadas = fakeMailer.mails.sent()
  const ultima = enviadas.at(-1) as any
  const codigo = ultima?.message?.contentViews?.html?.data?.codigo
  if (!codigo) throw new Error('Nenhum código OTP encontrado na última mensagem capturada')
  return codigo
}

let fakeMailer: ReturnType<typeof mail.fake>

test.group('promotor_auth_repository', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => {
    fakeMailer = mail.fake()
    return () => mail.restore()
  })

  test('pedirOtp cria um OTP com hash (nunca em claro) e envia email', async ({ assert }) => {
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({ nome: 'Ana', email: `otp1-${Date.now()}@example.com` })

    const authRepo = new PromotorAuthRepository()
    await authRepo.pedirOtp(promotor.email)

    const otp = await PromotorOtp.query().where('promotor_id', promotor.id).firstOrFail()
    assert.isNull(otp.used_at)
    assert.isAbove(otp.codigo_hash.length, 10)
    // O código em claro nunca aparece no hash guardado.
    const codigoReal = extrairCodigoDoUltimoEmail()
    assert.notInclude(otp.codigo_hash, codigoReal)

    fakeMailer.mails.assertSent(PromotorOtpMail, (mail: any) => mail.message.hasTo(promotor.email))
  })

  test('confirmarOtp com o código certo autentica e devolve um token', async ({ assert }) => {
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({ nome: 'Bruno', email: `otp2-${Date.now()}@example.com` })

    const authRepo = new PromotorAuthRepository()
    await authRepo.pedirOtp(promotor.email)
    const codigo = extrairCodigoDoUltimoEmail()

    const resultado = await authRepo.confirmarOtp(promotor.email, codigo)
    assert.isNotNull(resultado)
    assert.isString(resultado!.token)
    assert.equal(resultado!.promotor.id, promotor.id)
  })

  test('confirmarOtp com código errado devolve null', async ({ assert }) => {
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({ nome: 'Carla', email: `otp3-${Date.now()}@example.com` })

    const authRepo = new PromotorAuthRepository()
    await authRepo.pedirOtp(promotor.email)
    const codigoReal = extrairCodigoDoUltimoEmail()
    const codigoErrado = codigoReal === '111111' ? '222222' : '111111'

    const resultado = await authRepo.confirmarOtp(promotor.email, codigoErrado)
    assert.isNull(resultado)
  })

  test('um OTP já confirmado não pode ser reutilizado', async ({ assert }) => {
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({ nome: 'Duda', email: `otp4-${Date.now()}@example.com` })

    const authRepo = new PromotorAuthRepository()
    await authRepo.pedirOtp(promotor.email)
    const codigo = extrairCodigoDoUltimoEmail()

    const primeira = await authRepo.confirmarOtp(promotor.email, codigo)
    assert.isNotNull(primeira)

    const segunda = await authRepo.confirmarOtp(promotor.email, codigo)
    assert.isNull(segunda)
  })

  test('um OTP expirado é rejeitado', async ({ assert }) => {
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({ nome: 'Duda2', email: `otp4b-${Date.now()}@example.com` })

    const authRepo = new PromotorAuthRepository()
    await authRepo.pedirOtp(promotor.email)
    const codigo = extrairCodigoDoUltimoEmail()

    const otp = await PromotorOtp.query().where('promotor_id', promotor.id).firstOrFail()
    otp.expires_at = otp.expires_at.minus({ minutes: 20 })
    await otp.save()

    const resultado = await authRepo.confirmarOtp(promotor.email, codigo)
    assert.isNull(resultado)
  })

  test('promotorPorToken resolve o promotor a partir de um token válido, e null para um inválido', async ({ assert }) => {
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({ nome: 'Edu', email: `otp5-${Date.now()}@example.com` })

    const authRepo = new PromotorAuthRepository()
    await authRepo.pedirOtp(promotor.email)
    const codigo = extrairCodigoDoUltimoEmail()
    const { token } = (await authRepo.confirmarOtp(promotor.email, codigo))!

    const encontrado = await authRepo.promotorPorToken(token)
    assert.equal(encontrado?.id, promotor.id)

    const naoEncontrado = await authRepo.promotorPorToken('token-invalido-qualquer')
    assert.isNull(naoEncontrado)
  })

  test('pedirOtp para um email desconhecido não lança erro nem envia email (não revela existência)', async ({ assert }) => {
    const authRepo = new PromotorAuthRepository()
    await authRepo.pedirOtp('ninguem-registado@example.com')
    fakeMailer.mails.assertNoneSent()
  })
})
