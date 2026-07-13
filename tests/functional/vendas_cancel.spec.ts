import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import VendasRepository from '#repositories/vendas_repository'
import VendaIsAlreadyOpenOrCloseException from '#exceptions/venda_is_already_open_or_close_exception'
import Vendas from '#models/faturacao/vendas'
import { createTenant, createCaixa, createVenda } from '../helpers/fixtures.js'

test.group('vendas_repository.cancel()', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('anula uma venda em aberto', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'aberta' })

    const repo = new VendasRepository()
    const cancelada = await repo.cancel({ id: venda.id, company_alias: empresa.company_alias })

    assert.equal(cancelada.status, 'cancelada')
    assert.equal((await Vendas.findOrFail(venda.id)).status, 'cancelada')
  })

  test('não permite anular uma venda que já está fechada', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada' })

    const repo = new VendasRepository()
    try {
      await repo.cancel({ id: venda.id, company_alias: empresa.company_alias })
      assert.fail('deveria ter lançado VendaIsAlreadyOpenOrCloseException')
    } catch (error) {
      assert.instanceOf(error, VendaIsAlreadyOpenOrCloseException)
    }
    assert.equal((await Vendas.findOrFail(venda.id)).status, 'fechada', 'o estado não deve mudar quando a operação é rejeitada')
  })

  test('não permite anular uma venda já cancelada ou reembolsada', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)

    const repo = new VendasRepository()

    const vendaCancelada = await createVenda(caixa, { status: 'cancelada' })
    await assert.rejects(() => repo.cancel({ id: vendaCancelada.id, company_alias: empresa.company_alias }))

    const vendaReembolsada = await createVenda(caixa, { status: 'reembolsada' })
    await assert.rejects(() => repo.cancel({ id: vendaReembolsada.id, company_alias: empresa.company_alias }))
  })
})
