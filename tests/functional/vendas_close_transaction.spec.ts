import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import VendasRepository from '#repositories/vendas_repository'
import Lote from '#models/faturacao/lote'
import Estoque from '#models/faturacao/estoque'
import Vendas from '#models/faturacao/vendas'
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
 * Regressão para o bug corrigido em vendas_repository.close(): antes, cada item da venda
 * gerava a sua própria movimentação de stock fora de qualquer transação partilhada. Se o
 * item N de uma venda com vários itens falhasse (ex.: stock insuficiente), os itens 1..N-1
 * já tinham debitado stock de forma irreversível e a venda nunca fechava — uma
 * inconsistência permanente. Agora tudo corre dentro de uma única transação.
 */
test.group('vendas_repository.close() - atomicidade da transação', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('reverte todas as movimentações de stock se um item não tiver stock suficiente', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()

    const produtoA = await createProduto(empresa)
    const loteA = await createLote(produtoA, { quantidade_em_estoque: 10 })

    const produtoB = await createProduto(empresa)
    const loteB = await createLote(produtoB, { quantidade_em_estoque: 3 })

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)

    // item 1: pede 5 de 10 disponíveis (sozinho, teria sucesso)
    await createVendaItem(venda, loteA, { quantidade: 5, preco_unitario: 1000 })
    // item 2: pede 10 de apenas 3 disponíveis (força a falha a meio do fecho)
    await createVendaItem(venda, loteB, { quantidade: 10, preco_unitario: 2000 })

    // Pagamento pelo total "teórico" (5*1000 + 10*2000) — não é isto que se testa aqui;
    // sem ele, close() rejeitaria por falta de pagamento antes sequer de chegar ao stock.
    await pagarVenda(venda, 5 * 1000 + 10 * 2000)

    const repo = new VendasRepository()

    await assert.rejects(() =>
      repo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })
    )

    const vendaAfter = await Vendas.findOrFail(venda.id)
    assert.equal(vendaAfter.status, 'aberta', 'a venda não deve fechar quando um item falha')
    assert.equal(Number(vendaAfter.total), 0, 'o total não deve ser aplicado quando a transação reverte')

    const loteAAfter = await Lote.findOrFail(loteA.id)
    const loteBAfter = await Lote.findOrFail(loteB.id)
    assert.equal(
      Number(loteAAfter.quantidade_em_estoque),
      10,
      'o stock do item que teria sucesso sozinho não pode ter sido debitado'
    )
    assert.equal(Number(loteBAfter.quantidade_em_estoque), 3, 'o stock do item insuficiente mantém-se inalterado')

    const movimentacoes = await Estoque.query().where('lote_produto_id', loteA.id).orWhere('lote_produto_id', loteB.id)
    assert.lengthOf(movimentacoes, 0, 'nenhuma movimentação de stock deve persistir quando a venda não fecha')
  })

  test('fecha a venda e regista o stock de todos os itens quando há stock suficiente', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()

    const produtoA = await createProduto(empresa)
    const loteA = await createLote(produtoA, { quantidade_em_estoque: 10 })

    const produtoB = await createProduto(empresa)
    const loteB = await createLote(produtoB, { quantidade_em_estoque: 10 })

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)

    await createVendaItem(venda, loteA, { quantidade: 3, preco_unitario: 1000 })
    await createVendaItem(venda, loteB, { quantidade: 2, preco_unitario: 1500 })
    await pagarVenda(venda, 3 * 1000 + 2 * 1500)

    const repo = new VendasRepository()
    await repo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    const vendaAfter = await Vendas.findOrFail(venda.id)
    assert.equal(vendaAfter.status, 'fechada')
    assert.equal(Number(vendaAfter.total), 3 * 1000 + 2 * 1500)

    const loteAAfter = await Lote.findOrFail(loteA.id)
    const loteBAfter = await Lote.findOrFail(loteB.id)
    assert.equal(Number(loteAAfter.quantidade_em_estoque), 7)
    assert.equal(Number(loteBAfter.quantidade_em_estoque), 8)

    const movimentacoesA = await Estoque.query().where('lote_produto_id', loteA.id)
    const movimentacoesB = await Estoque.query().where('lote_produto_id', loteB.id)
    assert.lengthOf(movimentacoesA, 1)
    assert.lengthOf(movimentacoesB, 1)
    assert.equal(movimentacoesA[0].tipo_movimentacao, 'saida')
  })
})
