import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import AuthRepository from '#repositories/auth_repository'
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

    const enviada = fakeMailer.messages.sent().at(-1) as any
    const resetUrl = enviada?.contentViews?.html?.data?.resetUrl as string

    assert.isString(resetUrl)
    assert.include(resetUrl, empresa.company_alias)
    assert.notInclude(resetUrl, 'undefined')
  })
})
