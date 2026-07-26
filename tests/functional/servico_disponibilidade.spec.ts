import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import VendasRepository from '#repositories/vendas_repository'
import VendaItensRepository from '#repositories/venda_itens_repository'
import Lote from '#models/faturacao/lote'
import Vendas from '#models/faturacao/vendas'
import ServicoIndisponivelException from '#exceptions/servico_indisponivel_exception'
import VendaIsAlreadyOpenOrCloseException from '#exceptions/venda_is_already_open_or_close_exception'
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
 * Regressão: um serviço (produtos.is_service = true) tem sempre quantidade_em_estoque = 0 no
 * seu lote — antes disto, `estoque_repository.create()` (chamado por `vendas_repository.close()`
 * para cada item da venda) tratava "saida" da mesma forma para produtos e serviços, comparando
 * a quantidade pedida contra o stock disponível. Como esse disponível era sempre 0, fechar
 * QUALQUER venda com um serviço lá dentro falhava sempre com EstoqueInsuficienteException — era
 * literalmente impossível vender um serviço. Corrigido: para serviços, a disponibilidade passa a
 * ser decidida por `produtos.disponivel` (nova coluna, default true), não pelo stock.
 */
test.group('vendas_repository.close() - serviços não usam critério de stock', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('fecha normalmente uma venda com um serviço disponível, sem mexer no stock (fica em 0)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const servico = await createProduto(empresa, { is_service: true, disponivel: true })
    const loteServico = await createLote(servico, { quantidade_em_estoque: 0, preco_venda: 5000 })

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, loteServico, { quantidade: 1, preco_unitario: 5000 })
    await pagarVenda(venda, 5000)

    const vendasRepo = new VendasRepository()
    await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    const vendaAfter = await Vendas.findOrFail(venda.id)
    assert.equal(vendaAfter.status, 'fechada')
    assert.equal(Number(vendaAfter.total), 5000)

    const loteAfter = await Lote.findOrFail(loteServico.id)
    assert.equal(Number(loteAfter.quantidade_em_estoque), 0, 'stock de serviço nunca deve ser mexido')
  })

  test('não fecha uma venda com um serviço marcado como indisponível', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const servico = await createProduto(empresa, { is_service: true, disponivel: false })
    const loteServico = await createLote(servico, { quantidade_em_estoque: 0, preco_venda: 3000 })

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, loteServico, { quantidade: 1, preco_unitario: 3000 })
    await pagarVenda(venda, 3000)

    const vendasRepo = new VendasRepository()

    try {
      await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })
      assert.fail('deveria ter lançado ServicoIndisponivelException')
    } catch (error) {
      assert.instanceOf(error, ServicoIndisponivelException)
    }

    const vendaAfter = await Vendas.findOrFail(venda.id)
    assert.equal(vendaAfter.status, 'aberta', 'a venda não deve fechar quando o serviço está indisponível')
  })

  test('um produto normal continua sujeito ao critério de stock (não é afectado pela mudança)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa, { is_service: false })
    const lote = await createLote(produto, { quantidade_em_estoque: 0, preco_venda: 1000 })

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 1, preco_unitario: 1000 })
    await pagarVenda(venda, 1000)

    const vendasRepo = new VendasRepository()
    await assert.rejects(() =>
      vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })
    )
  })
})

/**
 * Regressão: `venda_itens_repository.create()` confiava inteiramente no validator HTTP para
 * garantir que `venda_id` pertence ao tenant certo e está aberta — chamado directamente (outro
 * repositório, um teste), não havia protecção nenhuma. Agora `create()` resolve a venda via
 * `vendas_repository.findOrFail()` (escopado por company_alias) antes de tudo o resto.
 */
test.group('venda_itens_repository.create() - venda tem de pertencer ao tenant e estar aberta', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('rejeita adicionar item a uma venda de outra empresa', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()

    const produtoB = await createProduto(tenantB.empresa)
    const loteB = await createLote(produtoB)

    const caixaA = await createCaixa(tenantA.user, tenantA.pos)
    const vendaA = await createVenda(caixaA)

    const itensRepo = new VendaItensRepository()

    await assert.rejects(() =>
      itensRepo.create({
        venda_id: vendaA.id,
        lote_produto_id: loteB.id,
        quantidade: 1,
        quantidade_reembolsada: 0,
        company_alias: tenantB.empresa.company_alias,
      } as any)
    )
  })

  test('rejeita adicionar item a uma venda já fechada', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10 })

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada' })

    const itensRepo = new VendaItensRepository()

    try {
      await itensRepo.create({
        venda_id: venda.id,
        lote_produto_id: lote.id,
        quantidade: 1,
        quantidade_reembolsada: 0,
        company_alias: empresa.company_alias,
      } as any)
      assert.fail('deveria ter lançado VendaIsAlreadyOpenOrCloseException')
    } catch (error) {
      assert.instanceOf(error, VendaIsAlreadyOpenOrCloseException)
    }
  })

  test('permite adicionar item a uma venda aberta do próprio tenant', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10 })

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)

    const itensRepo = new VendaItensRepository()
    const item = await itensRepo.create({
      venda_id: venda.id,
      lote_produto_id: lote.id,
      quantidade: 2,
      quantidade_reembolsada: 0,
      company_alias: empresa.company_alias,
    } as any)

    assert.equal(item?.quantidade, 2)
  })
})
