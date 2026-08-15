import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import { UsersCreateValidator, DomainUserUpdateValidator } from '#validators/auth_validator'
import { createEmpresa, createUser } from '../helpers/fixtures.js'

/**
 * A unicidade de `username`/`email` tem de ser verificada **por domínio** (empresa), tal
 * como a BD já impõe (`unique(['email','empresa_id'])` / `unique(['username','empresa_id'])`
 * em `create_users_table` — o `unique()` global do email está comentado lá).
 *
 * Antes destes testes:
 * - `UsersCreateValidator` fazia `.first()` ANTES do `.where('empresa.company_alias', ...)`,
 *   ou seja chamava `.where()` sobre a LINHA devolvida (ou sobre `null`) — `POST
 *   api/:company_alias/auth/register` rebentava sempre com um TypeError, devolvido como
 *   500 pelo controller. O filtro por empresa nunca chegava a fazer parte da query.
 * - `DomainUserUpdateValidator` verificava a unicidade globalmente (sem empresa), o que
 *   impedia uma empresa de usar um email/username já existente noutro tenant.
 */
test.group('auth_validator — unicidade por domínio', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('registo: rejeita username já usado na MESMA empresa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const existente = await createUser(empresa)

    await assert.rejects(() =>
      UsersCreateValidator.validate({
        username: existente.username,
        email: 'novo@example.com',
        papel: ['Vendedor'],
        params: { company_alias: empresa.company_alias },
      })
    )
  })

  test('registo: rejeita email já usado na MESMA empresa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const existente = await createUser(empresa)

    await assert.rejects(() =>
      UsersCreateValidator.validate({
        username: 'nome.novo',
        email: existente.email,
        papel: ['Vendedor'],
        params: { company_alias: empresa.company_alias },
      })
    )
  })

  test('registo: aceita o mesmo username/email numa empresa DIFERENTE', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const daEmpresaA = await createUser(empresaA)

    const payload = await UsersCreateValidator.validate({
      username: daEmpresaA.username,
      email: daEmpresaA.email,
      papel: ['Vendedor'],
      params: { company_alias: empresaB.company_alias },
    })

    assert.equal(payload.email, daEmpresaA.email)
  })

  test('registo: passa quando ninguém na empresa usa esse username/email', async ({ assert }) => {
    const empresa = await createEmpresa()
    await createUser(empresa)

    const payload = await UsersCreateValidator.validate({
      username: 'funcionario.novo',
      email: 'funcionario.novo@example.com',
      papel: ['Vendedor', 'Estoquista'],
      params: { company_alias: empresa.company_alias },
    })

    assert.equal(payload.username, 'funcionario.novo')
  })

  test('update: rejeita email de OUTRO funcionário da mesma empresa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const alvo = await createUser(empresa)
    const colega = await createUser(empresa)

    await assert.rejects(() =>
      DomainUserUpdateValidator.validate(
        { email: colega.email, params: { company_alias: empresa.company_alias } },
        { meta: { user_id: alvo.id } }
      )
    )
  })

  test('update: aceita gravar mantendo o próprio username/email', async ({ assert }) => {
    const empresa = await createEmpresa()
    const alvo = await createUser(empresa)

    const payload = await DomainUserUpdateValidator.validate(
      {
        username: alvo.username,
        email: alvo.email,
        params: { company_alias: empresa.company_alias },
      },
      { meta: { user_id: alvo.id } }
    )

    assert.equal(payload.email, alvo.email)
  })

  test('update: aceita um email igual ao de um funcionário de OUTRA empresa', async ({
    assert,
  }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const alvo = await createUser(empresaA)
    const daEmpresaB = await createUser(empresaB)

    const payload = await DomainUserUpdateValidator.validate(
      { email: daEmpresaB.email, params: { company_alias: empresaA.company_alias } },
      { meta: { user_id: alvo.id } }
    )

    assert.equal(payload.email, daEmpresaB.email)
  })

  test('update: um funcionário desactivado (soft delete) continua a bloquear o email', async ({
    assert,
  }) => {
    // A constraint da BD é sobre (email, empresa_id) e ignora `deleted_at` — se o validator
    // aceitasse aqui, o UPDATE rebentaria com chave duplicada (500) em vez de um 400.
    const empresa = await createEmpresa()
    const alvo = await createUser(empresa)
    const desactivado = await createUser(empresa)
    await desactivado.merge({ deletedAt: DateTime.now() }).save()

    await assert.rejects(() =>
      DomainUserUpdateValidator.validate(
        { email: desactivado.email, params: { company_alias: empresa.company_alias } },
        { meta: { user_id: alvo.id } }
      )
    )
  })
})
