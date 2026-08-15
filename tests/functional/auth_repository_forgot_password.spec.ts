import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import AuthRepository from '#repositories/auth_repository'
import User from '#models/user'
import { createEmpresa, createUser } from '../helpers/fixtures.js'

test.group('auth_repository.forgot_password', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let fakeMailer: ReturnType<typeof mail.fake>
  group.each.setup(() => {
    fakeMailer = mail.fake()
    return () => mail.restore()
  })

  test('o link de redefinição enviado por email inclui o company_alias real da empresa', async ({ assert }) => {
    const empresa = await createEmpresa({ company_alias: 'empresa-forgot-teste' })
    const user = await createUser(empresa)

    const authRepo = new AuthRepository()
    await authRepo.forgot_password({ email: user.email!, company_alias: empresa.company_alias })

    // forgot_password envia via ForgotPasswordMail (Mailable) — o fake mailer regista isso em
    // `.mails`, não em `.messages` (só para o estilo `mail.send((message) => ...)`); o `Message`
    // real (com `contentViews`) fica em `mail.message`, um nível abaixo.
    const enviada = fakeMailer.mails.sent().at(-1) as any
    const resetUrl = enviada?.message?.contentViews?.html?.data?.resetUrl as string

    assert.isString(resetUrl)
    assert.include(resetUrl, empresa.company_alias)
    assert.notInclude(resetUrl, 'undefined')
  })

  /**
   * A unicidade de `email` é por empresa (`unique(['email','empresa_id'])`, ver
   * auth_validator.ts), por isso o mesmo email pode existir em dois tenants. A procura
   * era `User.findBy('email', ...)` — global — e podia enviar o link de redefinição ao
   * utilizador da empresa errada.
   */
  test('o mesmo email em duas empresas: só o utilizador da empresa pedida é recuperado', async ({
    assert,
  }) => {
    const empresaA = await createEmpresa({ company_alias: 'empresa-forgot-a' })
    const empresaB = await createEmpresa({ company_alias: 'empresa-forgot-b' })
    const email = 'partilhado@example.com'

    const userA = await User.create({
      username: 'homonimo-a',
      email,
      password: 'Password123!#',
      empresa_id: empresaA.id,
    })
    const userB = await User.create({
      username: 'homonimo-b',
      email,
      password: 'Password123!#',
      empresa_id: empresaB.id,
    })

    const authRepo = new AuthRepository()
    const recuperado = await authRepo.forgot_password({ email, company_alias: 'empresa-forgot-b' })

    assert.equal(recuperado.id, userB.id)
    assert.notEqual(recuperado.id, userA.id)

    const enviada = fakeMailer.mails.sent().at(-1) as any
    const resetUrl = enviada?.message?.contentViews?.html?.data?.resetUrl as string
    assert.include(resetUrl, 'empresa-forgot-b')
    assert.notInclude(resetUrl, userA.id)

    // Os dois sentidos: com UUID como chave primária, a query global antiga podia devolver
    // qualquer um dos dois — só pedindo por cada empresa se prova que não é acaso.
    const recuperadoA = await authRepo.forgot_password({ email, company_alias: 'empresa-forgot-a' })
    assert.equal(recuperadoA.id, userA.id)
  })

  test('email inexistente nessa empresa não envia nada (falha em vez de mandar link para undefined)', async ({
    assert,
  }) => {
    const empresa = await createEmpresa({ company_alias: 'empresa-forgot-vazia' })
    const authRepo = new AuthRepository()

    await assert.rejects(() =>
      authRepo.forgot_password({
        email: 'ninguem@example.com',
        company_alias: empresa.company_alias,
      })
    )
    assert.lengthOf(fakeMailer.mails.sent(), 0)
  })
})
