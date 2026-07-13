import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import CaixaRepository from '#repositories/caixa_repository'
import UnAuthorizedCaixaException from '#exceptions/un_authorized_caixa_exception'
import { createEmpresa, createUser, createPos, createCaixa } from '../helpers/fixtures.js'

/**
 * Regressão para a condição de autorização invertida encontrada em caixa_repository:
 * `close`/`reopen`/`destroy` bloqueavam gestores (Admin/Gerente/Supervisor) e deixavam
 * qualquer outro utilizador comum mexer em caixas alheias. A correção negou a condição
 * (`!(await userHasRole(...))`); estes testes fixam esse comportamento.
 */
test.group('caixa_repository - autorização em close/reopen/destroy', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('um utilizador comum não pode fechar a caixa de outro utilizador', async ({ assert }) => {
    const empresa = await createEmpresa()
    const owner = await createUser(empresa)
    const outro = await createUser(empresa) // sem papel nenhum
    const pos = await createPos(empresa)
    const caixa = await createCaixa(owner, pos, { status: 'aberto' })

    const repo = new CaixaRepository()

    await assert.rejects(() =>
      repo.close(caixa.id, { user_id: outro.id, company_alias: empresa.company_alias })
    )
  })

  test('um Admin do mesmo tenant pode fechar a caixa de outro utilizador', async ({ assert }) => {
    const empresa = await createEmpresa()
    const owner = await createUser(empresa)
    const admin = await createUser(empresa, ['Admin'])
    const pos = await createPos(empresa)
    const caixa = await createCaixa(owner, pos, { status: 'aberto' })

    const repo = new CaixaRepository()

    const closed = await repo.close(caixa.id, { user_id: admin.id, company_alias: empresa.company_alias })
    assert.equal(closed.status, 'fechado')
  })

  test('o próprio dono continua a poder fechar a sua caixa, sem precisar de papel nenhum', async ({ assert }) => {
    const empresa = await createEmpresa()
    const owner = await createUser(empresa)
    const pos = await createPos(empresa)
    const caixa = await createCaixa(owner, pos, { status: 'aberto' })

    const repo = new CaixaRepository()
    const closed = await repo.close(caixa.id, { user_id: owner.id, company_alias: empresa.company_alias })
    assert.equal(closed.status, 'fechado')
  })

  test('a exceção lançada é especificamente UnAuthorizedCaixaException', async ({ assert }) => {
    const empresa = await createEmpresa()
    const owner = await createUser(empresa)
    const outro = await createUser(empresa)
    const pos = await createPos(empresa)
    const caixa = await createCaixa(owner, pos, { status: 'aberto' })

    const repo = new CaixaRepository()

    try {
      await repo.close(caixa.id, { user_id: outro.id, company_alias: empresa.company_alias })
      assert.fail('deveria ter lançado UnAuthorizedCaixaException')
    } catch (error) {
      assert.instanceOf(error, UnAuthorizedCaixaException)
    }
  })
})
