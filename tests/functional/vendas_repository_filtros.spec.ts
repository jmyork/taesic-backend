import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import VendasRepository from '#repositories/vendas_repository'
import { createTenant, createCaixa, createVenda } from '../helpers/fixtures.js'

/**
 * `VendasQueryValidator` expõe `fechado: boolean`, mas `vendas_repository.paginate()`
 * só sabia filtrar por `status` (string) — nunca lia `filter.fechado` em lado nenhum.
 * `GET vendas?fechado=true|false` validava o parâmetro e depois ignorava-o
 * silenciosamente, devolvendo sempre todas as vendas independentemente do valor. Só
 * descoberto ao testar os filtros via HTTP real; nenhum teste anterior cobria isto.
 */
test.group('vendas_repository.paginate() — filtro fechado', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('fechado=true devolve só vendas fechadas; fechado=false só vendas abertas', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const vendaAberta = await createVenda(caixa, { status: 'aberta' })
    const vendaFechada = await createVenda(caixa, { status: 'fechada' })
    await createVenda(caixa, { status: 'cancelada' })

    const repo = new VendasRepository()

    const fechadas = await repo.paginate(1, 20, { fechado: true, company_alias: empresa.company_alias })
    assert.lengthOf(fechadas, 1)
    assert.equal(fechadas[0].id, vendaFechada.id)

    const abertas = await repo.paginate(1, 20, { fechado: false, company_alias: empresa.company_alias })
    assert.lengthOf(abertas, 1)
    assert.equal(abertas[0].id, vendaAberta.id)
  })

  /**
   * `VendasQueryValidator` nem sequer expunha `status` (só `fechado`, que só cobre
   * aberta/fechada) — não havia forma de filtrar `?status=cancelada` ou `=reembolsada`
   * via query, mesmo o repositório já sabendo fazê-lo. Adicionado ao validator.
   */
  test('status filtra por qualquer um dos 4 estados (cancelada/reembolsada incluídos)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'aberta' })
    await createVenda(caixa, { status: 'fechada' })
    const vendaCancelada = await createVenda(caixa, { status: 'cancelada' })

    const repo = new VendasRepository()
    const canceladas = await repo.paginate(1, 20, { status: 'cancelada', company_alias: empresa.company_alias })
    assert.lengthOf(canceladas, 1)
    assert.equal(canceladas[0].id, vendaCancelada.id)
  })
})
