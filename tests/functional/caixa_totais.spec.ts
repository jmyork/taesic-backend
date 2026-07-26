import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import VendasRepository from '#repositories/vendas_repository'
import ProdutosReembolsoRepository from '#repositories/produtos_reembolso_repository'
import VendaItensRepository from '#repositories/venda_itens_repository'
import Caixa from '#models/caixa'
import {
  createTenant,
  createProduto,
  createLote,
  createCaixa,
  createVenda,
  createVendaItem,
  pagarVenda,
} from '../helpers/fixtures.js'

/**
 * Regressão: `caixa.total_vendas`/`total_caixa` nunca eram actualizados — ficavam sempre a 0
 * (o default do model), independentemente de quantas vendas fossem fechadas, reembolsadas ou
 * canceladas nessa caixa. Corrigido com `caixaRepository.recalcularTotais()`, chamado a partir
 * de `vendas_repository.close()`/`cancel()` e `produtos_reembolso_repository.reembolsar_total()`/
 * `reembolsar_parcial()`.
 */
test.group('caixa - total_vendas/total_caixa acompanham vendas/reembolsos/cancelamentos', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('fechar uma venda soma o total ao total_vendas/total_caixa da caixa', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10 })

    const caixa = await createCaixa(user, pos, { valor_inicial: 500 })
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 2, preco_unitario: 1000 })
    await pagarVenda(venda, 2000)

    const vendasRepo = new VendasRepository()
    await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    const caixaAfter = await Caixa.findOrFail(caixa.id)
    assert.equal(Number(caixaAfter.total_vendas), 2000)
    assert.equal(Number(caixaAfter.total_caixa), 500 + 2000)
  })

  test('duas vendas fechadas na mesma caixa somam-se em total_vendas', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 20 })

    const caixa = await createCaixa(user, pos, { valor_inicial: 0 })
    const vendasRepo = new VendasRepository()

    const venda1 = await createVenda(caixa)
    await createVendaItem(venda1, lote, { quantidade: 1, preco_unitario: 1000 })
    await pagarVenda(venda1, 1000)
    await vendasRepo.close({ id: venda1.id, user_id: user.id, company_alias: empresa.company_alias })

    const venda2 = await createVenda(caixa)
    await createVendaItem(venda2, lote, { quantidade: 3, preco_unitario: 500 })
    await pagarVenda(venda2, 1500)
    await vendasRepo.close({ id: venda2.id, user_id: user.id, company_alias: empresa.company_alias })

    const caixaAfter = await Caixa.findOrFail(caixa.id)
    assert.equal(Number(caixaAfter.total_vendas), 1000 + 1500)
    assert.equal(Number(caixaAfter.total_caixa), 1000 + 1500)
  })

  test('cancelar uma venda aberta não altera total_vendas (nunca tinha entrado na conta)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos, { valor_inicial: 100 })
    const venda = await createVenda(caixa)

    const vendasRepo = new VendasRepository()
    await vendasRepo.cancel({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    const caixaAfter = await Caixa.findOrFail(caixa.id)
    assert.equal(Number(caixaAfter.total_vendas), 0)
    assert.equal(Number(caixaAfter.total_caixa), 100)
  })

  test('reembolso total de uma venda remove o valor de total_vendas/total_caixa', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10 })

    const caixa = await createCaixa(user, pos, { valor_inicial: 0 })
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 2, preco_unitario: 1000 })
    await pagarVenda(venda, 2000)

    const vendasRepo = new VendasRepository()
    await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    let caixaAfter = await Caixa.findOrFail(caixa.id)
    assert.equal(Number(caixaAfter.total_vendas), 2000)

    const reembolsoRepo = new ProdutosReembolsoRepository()
    await reembolsoRepo.reembolsar_total({ venda_id: venda.id, user_id: user.id, company_alias: empresa.company_alias } as any)

    caixaAfter = await Caixa.findOrFail(caixa.id)
    assert.equal(Number(caixaAfter.total_vendas), 0)
    assert.equal(Number(caixaAfter.total_caixa), 0)
  })

  test('reembolso parcial reduz total_vendas/total_caixa proporcionalmente', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10 })

    const caixa = await createCaixa(user, pos, { valor_inicial: 0 })
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 4, preco_unitario: 1000 })
    await pagarVenda(venda, 4000)

    const vendasRepo = new VendasRepository()
    await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    let caixaAfter = await Caixa.findOrFail(caixa.id)
    assert.equal(Number(caixaAfter.total_vendas), 4000)

    const itensRepo = new VendaItensRepository()
    const itens = await itensRepo.paginate(1, 10, { venda_id: venda.id, company_alias: empresa.company_alias })

    const reembolsoRepo = new ProdutosReembolsoRepository()
    await reembolsoRepo.reembolsar_parcial({
      venda_item_id: itens[0].id,
      quantidade: 1,
      user_id: user.id,
      company_alias: empresa.company_alias,
    } as any)

    caixaAfter = await Caixa.findOrFail(caixa.id)
    assert.equal(Number(caixaAfter.total_vendas), 3000)
    assert.equal(Number(caixaAfter.total_caixa), 3000)
  })
})
