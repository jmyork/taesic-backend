import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import VendasRepository from '#repositories/vendas_repository'
import ProdutosReembolsoRepository from '#repositories/produtos_reembolso_repository'
import Lote from '#models/faturacao/lote'
import Vendas from '#models/faturacao/vendas'
import VendaItens from '#models/faturacao/venda_itens'
import ProdutosReembolso from '#models/faturacao/produtos_reembolso'
import {
  createTenant,
  createProduto,
  createLote,
  createCaixa,
  createVenda,
  createVendaItem,
  pagarVenda,
} from '../helpers/fixtures.js'

test.group('produtos_reembolso_repository', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('reembolsar_total devolve o stock, cria os reembolsos e esvazia a venda', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()

    const produtoA = await createProduto(empresa)
    const loteA = await createLote(produtoA, { quantidade_em_estoque: 10 })
    const produtoB = await createProduto(empresa)
    const loteB = await createLote(produtoB, { quantidade_em_estoque: 10 })

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, loteA, { quantidade: 3, preco_unitario: 1000 })
    await createVendaItem(venda, loteB, { quantidade: 2, preco_unitario: 1500 })

    const vendasRepo = new VendasRepository()
    await pagarVenda(venda, 6000)
    await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    // fechar a venda debita o stock — confirmar o ponto de partida antes de reembolsar
    assert.equal(Number((await Lote.findOrFail(loteA.id)).quantidade_em_estoque), 7)
    assert.equal(Number((await Lote.findOrFail(loteB.id)).quantidade_em_estoque), 8)

    const reembolsoRepo = new ProdutosReembolsoRepository()
    const reembolsos = await reembolsoRepo.reembolsar_total({
      venda_id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    assert.lengthOf(reembolsos, 2)

    const vendaAfter = await Vendas.findOrFail(venda.id)
    assert.equal(vendaAfter.status, 'reembolsada')
    assert.equal(Number(vendaAfter.total), 0)

    assert.equal(Number((await Lote.findOrFail(loteA.id)).quantidade_em_estoque), 10, 'stock do item A deve voltar ao valor original')
    assert.equal(Number((await Lote.findOrFail(loteB.id)).quantidade_em_estoque), 10, 'stock do item B deve voltar ao valor original')

    const itensRestantes = await VendaItens.query().where('venda_id', venda.id).whereNull('deleted_at')
    assert.lengthOf(itensRestantes, 0, 'os itens da venda devem ficar soft-deleted após reembolso total')
  })

  test('reembolsar_parcial recalcula o total da venda a partir dos itens restantes (dentro da mesma transação)', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()

    const produtoA = await createProduto(empresa)
    const loteA = await createLote(produtoA, { quantidade_em_estoque: 10 })
    const produtoB = await createProduto(empresa)
    const loteB = await createLote(produtoB, { quantidade_em_estoque: 10 })

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    const itemA = await createVendaItem(venda, loteA, { quantidade: 4, preco_unitario: 1000 }) // 4000
    await createVendaItem(venda, loteB, { quantidade: 2, preco_unitario: 1500 }) // 3000

    const vendasRepo = new VendasRepository()
    await pagarVenda(venda, 7000)
    await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })
    assert.equal(Number((await Vendas.findOrFail(venda.id)).total), 7000)

    const reembolsoRepo = new ProdutosReembolsoRepository()
    // devolve 1 das 4 unidades do item A -> ficam 3 unidades de A (3000) + 2 de B (3000) = 6000
    const reembolso = await reembolsoRepo.reembolsar_parcial({
      venda_id: venda.id,
      venda_item_id: itemA.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      quantidade: 1,
    })

    assert.exists(reembolso)

    const vendaAfter = await Vendas.findOrFail(venda.id)
    assert.equal(
      Number(vendaAfter.total),
      6000,
      'o total deve refletir a quantidade já reduzida do item A, lida dentro da mesma transação'
    )
    assert.notEqual(vendaAfter.status, 'reembolsada', 'ainda resta stock por reembolsar, a venda não deve fechar como reembolsada')

    const itemAAfter = await VendaItens.findOrFail(itemA.id)
    assert.equal(itemAAfter.quantidade, 3)

    assert.equal(Number((await Lote.findOrFail(loteA.id)).quantidade_em_estoque), 7, '6 vendidas - 1 devolvida = 7 (10 - 3 restantes)')

    const reembolsoRow = await ProdutosReembolso.query().where('venda_item_id', itemA.id).first()
    assert.isNotNull(reembolsoRow)
    assert.equal(reembolsoRow!.quantidade, 1)
  })

  test('reembolsar_parcial marca a venda como reembolsada quando não resta nenhum item', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produtoA = await createProduto(empresa)
    const loteA = await createLote(produtoA, { quantidade_em_estoque: 10 })

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    const itemA = await createVendaItem(venda, loteA, { quantidade: 2, preco_unitario: 1000 })

    const vendasRepo = new VendasRepository()
    await pagarVenda(venda, 2000)
    await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    const reembolsoRepo = new ProdutosReembolsoRepository()
    await reembolsoRepo.reembolsar_parcial({
      venda_id: venda.id,
      venda_item_id: itemA.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      quantidade: 2,
    })

    const vendaAfter = await Vendas.findOrFail(venda.id)
    assert.equal(vendaAfter.status, 'reembolsada')
    assert.equal(Number(vendaAfter.total), 0)
  })

  /**
   * `listByVenda` (chamado por `GET consultar-reembolso/:venda_id`) filtrava antes por
   * `produtos_reembolso.id = data.id` — um campo que a rota nunca envia (só manda
   * `venda_id`) e que, mesmo enviado, não corresponde ao id de uma venda. A rota rebentava
   * sempre com erro de validação (mascarado como 500 pelo controller). Corrigido para
   * filtrar pela venda e devolver todos os reembolsos associados a ela.
   */
  test('listByVenda devolve todos os reembolsos (parciais e totais) de uma venda', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produtoA = await createProduto(empresa)
    const loteA = await createLote(produtoA, { quantidade_em_estoque: 10 })

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    const itemA = await createVendaItem(venda, loteA, { quantidade: 5, preco_unitario: 1000 })

    const vendasRepo = new VendasRepository()
    await pagarVenda(venda, 5000)
    await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    const reembolsoRepo = new ProdutosReembolsoRepository()
    await reembolsoRepo.reembolsar_parcial({
      venda_id: venda.id,
      venda_item_id: itemA.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      quantidade: 2,
    })

    const reembolsos = await reembolsoRepo.listByVenda({
      venda_id: venda.id,
      company_alias: empresa.company_alias,
    })

    assert.lengthOf(reembolsos, 1)
    assert.equal(reembolsos[0].venda_item_id, itemA.id)
  })
})
