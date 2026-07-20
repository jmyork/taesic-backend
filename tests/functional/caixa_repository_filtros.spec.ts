import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import CaixaRepository from '#repositories/caixa_repository'
import { createTenant, createUser, createCaixa } from '../helpers/fixtures.js'

/**
 * `caixa_repository.paginate()`/`listByUser()` partilham `applyFilters()` (extraído
 * nesta sessão para eliminar ~150 linhas duplicadas — ver CLAUDE.md secção 2). Nenhum
 * teste cobria os filtros em si até agora, só a autorização em close/reopen/destroy
 * (ver `caixa_repository_authorization.spec.ts`).
 */
test.group('caixa_repository.paginate()/listByUser() — filtros', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('filtra por status e por intervalo de valor_inicial', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const outroUser = await createUser(empresa)
    const repo = new CaixaRepository()

    const caixaAberta = await createCaixa(user, pos, { status: 'aberto', valor_inicial: 1000 })
    const caixaFechada = await createCaixa(outroUser, pos, { status: 'fechado', valor_inicial: 5000 })

    const abertas = await repo.paginate(1, 20, { status: 'aberto', company_alias: empresa.company_alias })
    assert.lengthOf(abertas, 1)
    assert.equal(abertas[0].id, caixaAberta.id)

    const porValor = await repo.paginate(1, 20, {
      valor_inicial_start: 4000,
      valor_inicial_end: 6000,
      company_alias: empresa.company_alias,
    })
    assert.lengthOf(porValor, 1)
    assert.equal(porValor[0].id, caixaFechada.id)
  })

  test('observacoes filtra por correspondência parcial (LIKE)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const repo = new CaixaRepository()

    await createCaixa(user, pos, { status: 'aberto' })
    const caixaComNota = await createCaixa(user, pos, { status: 'fechado' })
    caixaComNota.observacoes = 'Fecho com diferença de troco'
    await caixaComNota.save()

    const encontradas = await repo.paginate(1, 20, {
      observacoes: 'diferença de troco',
      company_alias: empresa.company_alias,
    } as any)
    assert.lengthOf(encontradas, 1)
    assert.equal(encontradas[0].id, caixaComNota.id)
  })

  test('listByUser() só devolve caixas do utilizador indicado, com os mesmos filtros', async ({ assert }) => {
    const { user, pos } = await createTenant()
    const outroUser = await createUser((await createTenant()).empresa)
    const repo = new CaixaRepository()

    const minhaAberta = await createCaixa(user, pos, { status: 'aberto' })
    await createCaixa(outroUser, pos, { status: 'aberto' })

    const minhas = await repo.listByUser(user.id, { status: 'aberto' } as any)
    assert.lengthOf(minhas, 1)
    assert.equal(minhas[0].id, minhaAberta.id)
  })
})
