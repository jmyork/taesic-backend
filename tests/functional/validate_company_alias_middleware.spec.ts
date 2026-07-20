import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import ValidateCompanyAliasMiddleware from '#middleware/validate_company_alias_middleware'
import VerificationTokenHashService from '#services/verification_token_hash_service'
import VerificationTokenHash from '#models/verification_token_hash'
import { createEmpresa, createUser } from '../helpers/fixtures.js'

/**
 * Regressão para validate_company_alias_middleware: a versão antiga envolvia a query
 * inteira num try/catch que transformava QUALQUER erro (incluindo falhas reais de
 * infraestrutura, não só "alias inexistente") num 404 genérico "Rota Não Encontrada",
 * escondendo bugs/outages atrás de uma resposta enganosa. Estes testes cobrem os
 * caminhos legítimos (sucesso, alias em falta, alias/utilizador sem correspondência)
 * que continuam a funcionar depois de remover esse catch.
 */
test.group('validate_company_alias_middleware', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('avança para next() quando o alias corresponde a uma empresa do utilizador autenticado e verificado', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)

    const tokenService = new VerificationTokenHashService()
    const { id } = await tokenService.createToken({ user_id: user.id, purpose: 'account_activation' })
    const token = await VerificationTokenHash.findOrFail(id)
    token.verified = true
    await token.save()

    const ctx = await testUtils.createHttpContext()
    ctx.params.company_alias = empresa.company_alias
    ;(ctx as any).auth = { user }

    let nextCalled = false
    await new ValidateCompanyAliasMiddleware().handle(ctx, async () => {
      nextCalled = true
    })

    assert.isTrue(nextCalled)
  })

  test('devolve 400 quando o alias não é fornecido', async ({ assert }) => {
    const ctx = await testUtils.createHttpContext()
    ;(ctx as any).auth = { user: null }

    let nextCalled = false
    await new ValidateCompanyAliasMiddleware().handle(ctx, async () => {
      nextCalled = true
    })

    assert.isFalse(nextCalled)
    assert.equal(ctx.response.getStatus(), 400)
  })

  test('devolve 404 quando o alias não corresponde a nenhuma empresa do utilizador', async ({ assert }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa) // sem verification_token_hash verificado

    const ctx = await testUtils.createHttpContext()
    ctx.params.company_alias = empresa.company_alias
    ;(ctx as any).auth = { user }

    let nextCalled = false
    await new ValidateCompanyAliasMiddleware().handle(ctx, async () => {
      nextCalled = true
    })

    assert.isFalse(nextCalled)
    assert.equal(ctx.response.getStatus(), 404)
  })
})
