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

  /**
   * A busca de reembolso (`rembolso/page.tsx`) procurava a venda pelo seu `id` (UUID)
   * — inutilizável para um operador humano. `numero` (a numeração sequencial por-empresa
   * já adicionada a `vendas`) precisa de ser filtrável via `GET vendas?numero=X` para a
   * busca poder ser feita pelo número da factura em vez do UUID.
   */
  test('numero filtra pela numeração sequencial da venda, isolado por tenant', async ({ assert }) => {
    const { empresa: empresaA, user: userA, pos: posA } = await createTenant()
    const caixaA = await createCaixa(userA, posA)
    const vendaA1 = await createVenda(caixaA, { status: 'fechada' })
    vendaA1.empresa_id = empresaA.id
    vendaA1.numero = 1
    await vendaA1.save()
    const vendaA2 = await createVenda(caixaA, { status: 'fechada' })
    vendaA2.empresa_id = empresaA.id
    vendaA2.numero = 2
    await vendaA2.save()

    const { empresa: empresaB, user: userB, pos: posB } = await createTenant()
    const caixaB = await createCaixa(userB, posB)
    const vendaB1 = await createVenda(caixaB, { status: 'fechada' })
    vendaB1.empresa_id = empresaB.id
    vendaB1.numero = 1
    await vendaB1.save()

    const repo = new VendasRepository()

    const resultadoA = await repo.paginate(1, 20, { numero: 1, company_alias: empresaA.company_alias })
    assert.lengthOf(resultadoA, 1)
    assert.equal(resultadoA[0].id, vendaA1.id)

    const resultadoB = await repo.paginate(1, 20, { numero: 1, company_alias: empresaB.company_alias })
    assert.lengthOf(resultadoB, 1)
    assert.equal(resultadoB[0].id, vendaB1.id)
  })
})
