import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import { DateTime } from 'luxon'
import AuthRepository from '#repositories/auth_repository'
import VerificationTokenHashRepository from '#repositories/verification_token_hash_repository'
import User from '#models/user'
import VerificationTokenHash from '#models/verification_token_hash'
import Empresa from '#models/empresa'
import { createEmpresa, createUser } from '../helpers/fixtures.js'

/**
 * Alterar o email de um funcionário (`PUT api/:company_alias/auth/:user_id`) obriga a
 * reactivar a conta: o endereço novo recebe um link de activação, o antigo recebe um
 * aviso, e a entrada fica bloqueada até à confirmação. Ver `auth_repository.update()`.
 *
 * Antes desta sessão, `update()` gravava o email novo e mais nada — a conta continuava a
 * entrar com um endereço que ninguém tinha provado existir, e o dono do endereço anterior
 * nunca sabia que a sua conta lhe tinha sido tirada.
 */
test.group('funcionário — alteração de email', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let fakeMailer: ReturnType<typeof mail.fake>
  group.each.setup(() => {
    fakeMailer = mail.fake()
    return () => mail.restore()
  })

  /** Conta activada: `login()` exige um `verification_token_hash` verificado do utilizador. */
  async function activar(user: User) {
    return VerificationTokenHash.create({
      user_id: user.id,
      verification_token_public: `verificado-${user.id}`,
      verification_token_hash: 'x',
      verification_token_expires_at: DateTime.now().plus({ hours: 24 }),
      verified: true,
      purpose: 'account_activation',
    })
  }

  /** Os dados passados à view da última mailable enviada (mesmo padrão de
   * `auth_repository_forgot_password.spec.ts`: a Mailable fica em `.mails`, não em
   * `.messages`, e o `Message` real um nível abaixo). */
  function enviadas() {
    return fakeMailer.mails.sent().map((m: any) => ({
      // `nodeMailerMessage.to` é um array de strings simples (não de `{address}`).
      to: m.message?.nodeMailerMessage?.to?.[0],
      view: m.message?.contentViews?.html?.template,
      data: m.message?.contentViews?.html?.data ?? {},
    }))
  }

  test('alterar o email envia activação para o novo endereço e aviso para o antigo', async ({
    assert,
  }) => {
    const empresa = await createEmpresa({ nome: 'Padaria Central' })
    const funcionario = await createUser(empresa, ['Vendedor'])
    const emailAntigo = funcionario.email

    const repo = new AuthRepository()
    const { emailAlterado } = await repo.update({
      user_id: funcionario.id,
      company_alias: empresa.company_alias,
      email: 'novo.endereco@example.com',
    })

    assert.isTrue(emailAlterado)

    const mails = enviadas()
    assert.lengthOf(mails, 2, 'um para o endereço novo, outro para o antigo')

    const activacao = mails.find((m) => m.view === 'emails/email_alterado_activacao')!
    assert.equal(activacao.to, 'novo.endereco@example.com')
    assert.equal(activacao.data.emailAnterior, emailAntigo)
    assert.equal(activacao.data.company.name, 'Padaria Central')

    const aviso = mails.find((m) => m.view === 'emails/email_alterado_aviso')!
    assert.equal(aviso.to, emailAntigo, 'o dono do endereço antigo tem de ser avisado')
    assert.equal(aviso.data.emailNovo, 'novo.endereco@example.com')

    // O link tem de apontar para a página do frontend que trata da activação, com o token
    // que ficou mesmo gravado — não para a API, e nunca para `undefined`.
    const tokenNovo = await VerificationTokenHash.query()
      .where('user_id', funcionario.id)
      .whereNull('deleted_at')
      .firstOrFail()

    assert.isFalse(Boolean(tokenNovo.verified), 'o token novo nasce por confirmar')
    assert.equal(tokenNovo.purpose, 'account_activation')
    assert.include(activacao.data.verifyUrl, `/verify/${tokenNovo.verification_token_public}`)
    assert.notInclude(activacao.data.verifyUrl, 'undefined')
  })

  test('a conta fica sem acesso até o novo endereço ser confirmado', async ({ assert }) => {
    const empresa = await createEmpresa()
    const funcionario = await createUser(empresa)
    await activar(funcionario)

    const repo = new AuthRepository()
    // Antes da alteração entra normalmente.
    await repo.login({
      uid: funcionario.email,
      password: 'Password123!#',
      company_alias: empresa.company_alias,
    })

    await repo.update({
      user_id: funcionario.id,
      company_alias: empresa.company_alias,
      email: 'endereco.por.confirmar@example.com',
    })

    await assert.rejects(
      () =>
        repo.login({
          uid: 'endereco.por.confirmar@example.com',
          password: 'Password123!#',
          company_alias: empresa.company_alias,
        }),
      'Credenciais inválidas'
    )

    // ... e o endereço antigo também já não serve para entrar.
    await assert.rejects(() =>
      repo.login({
        uid: funcionario.email,
        password: 'Password123!#',
        company_alias: empresa.company_alias,
      })
    )

    // Confirmação pelo link do email → a entrada é reposta, com o endereço novo.
    const token = await VerificationTokenHash.query()
      .where('user_id', funcionario.id)
      .whereNull('deleted_at')
      .firstOrFail()

    const resultado = await new VerificationTokenHashRepository().verify(
      token.verification_token_public
    )
    assert.isTrue(resultado.success)

    const sessao = await repo.login({
      uid: 'endereco.por.confirmar@example.com',
      password: 'Password123!#',
      company_alias: empresa.company_alias,
    })
    assert.equal(sessao.type, 'bearer')
  })

  test('o link antigo deixa de servir para reactivar ou redefinir a palavra-passe', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const funcionario = await createUser(empresa)
    const tokenAntigo = await activar(funcionario)

    const repo = new AuthRepository()
    await repo.update({
      user_id: funcionario.id,
      company_alias: empresa.company_alias,
      email: 'outro.endereco@example.com',
    })

    const recarregado = await VerificationTokenHash.findOrFail(tokenAntigo.id)
    assert.isNotNull(recarregado.deletedAt, 'o token anterior fica invalidado')
    assert.isFalse(Boolean(recarregado.verified))

    // O link que está na caixa de correio ANTIGA não pode reactivar a conta...
    const verificacao = await new VerificationTokenHashRepository().verify(
      tokenAntigo.verification_token_public
    )
    assert.isFalse(verificacao.success)

    // ... nem definir uma palavra-passe nova.
    await assert.rejects(() =>
      repo.resetPassword({
        token: tokenAntigo.verification_token_public,
        email: 'outro.endereco@example.com',
        password: 'OutraPassword123!#',
      })
    )
  })

  test('as sessões activas do funcionário são revogadas', async ({ assert }) => {
    const empresa = await createEmpresa()
    const funcionario = await createUser(empresa)
    await User.accessTokens.create(funcionario)
    assert.lengthOf(await User.accessTokens.all(funcionario), 1)

    await new AuthRepository().update({
      user_id: funcionario.id,
      company_alias: empresa.company_alias,
      email: 'sessao.revogada@example.com',
    })

    assert.lengthOf(
      await User.accessTokens.all(funcionario),
      0,
      'sem isto o bloqueio era de fachada: quem já tinha token continuava a trabalhar'
    )
  })

  test('editar sem tocar no email não envia nada nem bloqueia a conta', async ({ assert }) => {
    const empresa = await createEmpresa()
    const funcionario = await createUser(empresa)
    const tokenActivo = await activar(funcionario)

    const repo = new AuthRepository()

    // Só o username.
    const { emailAlterado } = await repo.update({
      user_id: funcionario.id,
      company_alias: empresa.company_alias,
      username: 'nome.novo',
    })
    assert.isFalse(emailAlterado)

    // E gravar o MESMO email (o caso do formulário que reenvia todos os campos) também
    // não conta como alteração — senão bastava carregar em "Gravar" para deixar o
    // funcionário fechado de fora.
    await repo.update({
      user_id: funcionario.id,
      company_alias: empresa.company_alias,
      username: 'nome.novo',
      email: funcionario.email,
    })

    assert.lengthOf(fakeMailer.mails.sent(), 0)
    assert.isNull((await VerificationTokenHash.findOrFail(tokenActivo.id)).deletedAt)

    const sessao = await repo.login({
      uid: funcionario.email,
      password: 'Password123!#',
      company_alias: empresa.company_alias,
    })
    assert.equal(sessao.type, 'bearer')
  })

  test('falha no envio do email desfaz a alteração (ninguém fica bloqueado sem link)', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const funcionario = await createUser(empresa)
    const emailAntigo = funcionario.email
    const tokenActivo = await activar(funcionario)

    // O fake mailer não tem forma de injectar uma falha de envio — substitui-se o `send`
    // do próprio serviço, que é o que `auth_repository.update()` chama.
    const sendOriginal = mail.send.bind(mail)
    ;(mail as any).send = async () => {
      throw new Error('Resend indisponível')
    }

    const repo = new AuthRepository()
    try {
      await assert.rejects(() =>
        repo.update({
          user_id: funcionario.id,
          company_alias: empresa.company_alias,
          email: 'nunca.gravado@example.com',
        })
      )
    } finally {
      ;(mail as any).send = sendOriginal
    }

    const recarregado = await User.findOrFail(funcionario.id)
    assert.equal(recarregado.email, emailAntigo, 'sem email entregue, o endereço não muda')
    assert.isNull((await VerificationTokenHash.findOrFail(tokenActivo.id)).deletedAt)
  })

  test('não atravessa o isolamento por tenant', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const funcionarioB = await createUser(empresaB)

    await assert.rejects(() =>
      new AuthRepository().update({
        user_id: funcionarioB.id,
        company_alias: empresaA.company_alias,
        email: 'invasor@example.com',
      })
    )

    assert.notEqual((await User.findOrFail(funcionarioB.id)).email, 'invasor@example.com')
    assert.lengthOf(fakeMailer.mails.sent(), 0)
    assert.isNotNull(await Empresa.find(empresaB.id))
  })
})
