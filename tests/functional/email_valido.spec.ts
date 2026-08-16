import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { UsersCreateValidator } from '#validators/auth_validator'
import { ehEmailDescartavel } from '../../app/helpers/email_valido.js'
import { createEmpresa } from '../helpers/fixtures.js'

/**
 * O email de um utilizador é o único caminho para activar a conta e para recuperar a
 * palavra-passe (a password é sempre definida por link). Um endereço temporário — que
 * expira em minutos — deixa a conta inutilizável e irrecuperável, e no caso do dono da
 * empresa é ainda o contacto que sai impresso nas facturas.
 */
test.group('email utilizável', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('reconhece domínios descartáveis, incluindo subdomínios', ({ assert }) => {
    assert.isTrue(ehEmailDescartavel('alguem@mailinator.com'))
    assert.isTrue(ehEmailDescartavel('ALGUEM@YOPMAIL.COM'), 'a comparação ignora maiúsculas')
    assert.isTrue(ehEmailDescartavel('x@qualquer.mailinator.com'), 'subdomínio do mesmo serviço')
    assert.isTrue(ehEmailDescartavel('x@temp-mail.org'))

    assert.isFalse(ehEmailDescartavel('jose@bknkv.com'))
    assert.isFalse(ehEmailDescartavel('jose@gmail.com'))
  })

  test('o registo de funcionário recusa um email temporário', async ({ assert }) => {
    const empresa = await createEmpresa()

    await assert.rejects(() =>
      UsersCreateValidator.validate({
        username: 'funcionario.temp',
        email: 'descartavel@mailinator.com',
        papel: ['Vendedor'],
        params: { company_alias: empresa.company_alias },
      })
    )
  })

  test('o registo de funcionário recusa um email sem domínio de topo', async ({ assert }) => {
    const empresa = await createEmpresa()

    // `a@b` passa no `.email()` do VineJS mas nunca receberia correio.
    await assert.rejects(() =>
      UsersCreateValidator.validate({
        username: 'funcionario.mau',
        email: 'alguem@servidor',
        papel: ['Vendedor'],
        params: { company_alias: empresa.company_alias },
      })
    )
  })

  test('aceita um email normal', async ({ assert }) => {
    const empresa = await createEmpresa()

    const payload = await UsersCreateValidator.validate({
      username: 'funcionario.bom',
      email: 'funcionario.bom@bknkv.com',
      papel: ['Vendedor'],
      params: { company_alias: empresa.company_alias },
    })

    assert.equal(payload.email, 'funcionario.bom@bknkv.com')
  })
})
