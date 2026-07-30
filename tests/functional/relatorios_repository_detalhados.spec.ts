import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import RelatoriosRepository from '#repositories/relatorios_repository'
import EstoqueRepository from '#repositories/estoque_repository'
import PromotorRepository from '#repositories/promotor_repository'
import CupomRepository from '#repositories/cupom_repository'
import Cliente from '#models/cliente'
import Empresa from '#models/empresa'
import Vendapagamento from '#models/vendapagamento'
import MetodoPagamento from '#models/metodopagamento'
import ProdutoCategorias from '#models/faturacao/produto_categorias'
import CategoriasProdutos from '#models/faturacao/categorias_produtos'
import TaxaIvaRepository from '#repositories/taxa_iva_repository'
import { createTenant, createCaixa, createVenda, createProduto, createLote, createVendaItem } from '../helpers/fixtures.js'

/**
 * Cobre os métodos de `relatorios_repository.ts` que ficaram sem teste dedicado na sessão
 * anterior (só seguiam o mesmo padrão validado noutros métodos, sem verificação própria) —
 * ver CLAUDE.md secção do módulo de relatórios. `relatorios_repository.spec.ts` já cobre
 * dashboardExecutivo/kpisGerais/comparativo/fluxoCaixa/documentosAnulados/notasCredito/
 * topProdutos/relatorioProdutos/relatorioVendas.
 */
test.group('relatorios_repository - métodos detalhados sem teste próprio', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('faturacaoPorPeriodo agrega quantidade/total só das vendas fechadas no período', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'fechada', total: 1000 })
    await createVenda(caixa, { status: 'fechada', total: 500 })
    await createVenda(caixa, { status: 'aberta', total: 9999 })

    const repo = new RelatoriosRepository()
    const resultado = await repo.faturacaoPorPeriodo({ company_alias: empresa.company_alias })

    assert.equal(resultado.quantidade, 2)
    assert.equal(resultado.total, 1500)
  })

  test('evolucaoVendas agrupa por dia quando a granularidade é "dia"', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'fechada', total: 700 })
    await createVenda(caixa, { status: 'fechada', total: 300 })

    const repo = new RelatoriosRepository()
    const linhas = (await repo.evolucaoVendas({ company_alias: empresa.company_alias, granularidade: 'dia' })) as any[]

    assert.lengthOf(linhas, 1)
    assert.equal(Number(linhas[0].vendas_quantidade), 2)
    assert.equal(Number(linhas[0].vendas_total), 1000)
  })

  test('topCategorias agrega quantidade/receita por categoria de produto', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 2000 })

    const produto = await createProduto(empresa)
    const categoria = await ProdutoCategorias.create({
      nome: 'Categoria Teste',
      descricao: 'x',
      empresa_id: empresa.id,
    } as any)
    await CategoriasProdutos.create({ produto_id: produto.id, produto_categoria_id: categoria.id } as any)

    const lote = await createLote(produto, { preco_venda: 1000, preco_compra: 400 })
    await createVendaItem(venda, lote, { quantidade: 2, preco_unitario: 1000 })

    const repo = new RelatoriosRepository()
    const top = await repo.topCategorias({ company_alias: empresa.company_alias })
    const linha = (top as any[]).find((r) => r.categoria_id === categoria.id)

    assert.isDefined(linha)
    assert.equal(Number(linha.quantidade_vendida), 2)
    assert.equal(Number(linha.receita_total), 2000)
  })

  test('topClientes e relatorioClientes agregam nº de compras/total gasto/ticket médio por cliente', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const cliente = await Cliente.create({ tipo: 'Pessoa Física', nome: 'Cliente Top', empresa_id: empresa.id } as any)

    const venda1 = await createVenda(caixa, { status: 'fechada', total: 1000 })
    venda1.cliente_presencial_id = cliente.id
    await venda1.save()

    const venda2 = await createVenda(caixa, { status: 'fechada', total: 2000 })
    venda2.cliente_presencial_id = cliente.id
    await venda2.save()

    const repo = new RelatoriosRepository()

    const top = await repo.topClientes({ company_alias: empresa.company_alias })
    const linhaTop = (top as any[]).find((r) => r.cliente_id === cliente.id)
    assert.isDefined(linhaTop)
    assert.equal(Number(linhaTop.vendas_quantidade), 2)
    assert.equal(Number(linhaTop.vendas_total), 3000)

    const relatorio = await repo.relatorioClientes({ company_alias: empresa.company_alias })
    const linhaRelatorio = (relatorio as any).find((r: any) => r.cliente_id === cliente.id)
    assert.equal(Number(linhaRelatorio.vendas_quantidade), 2)
    assert.equal(Number(linhaRelatorio.ticket_medio), 1500)
  })

  test('topVendedores e relatorioUtilizadores agregam desempenho por utilizador (dono da caixa)', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'fechada', total: 1000 })
    await createVenda(caixa, { status: 'fechada', total: 1500 })

    const repo = new RelatoriosRepository()

    const top = await repo.topVendedores({ company_alias: empresa.company_alias })
    const linhaTop = (top as any[]).find((r) => r.user_id === user.id)
    assert.isDefined(linhaTop)
    assert.equal(Number(linhaTop.vendas_quantidade), 2)
    assert.equal(Number(linhaTop.vendas_total), 2500)

    const relatorio = await repo.relatorioUtilizadores({ company_alias: empresa.company_alias, user_id: user.id })
    const linhaRelatorio = (relatorio as any).find((r: any) => r.user_id === user.id)
    assert.equal(Number(linhaRelatorio.vendas_quantidade), 2)
    assert.equal(Number(linhaRelatorio.vendas_total), 2500)
    assert.equal(Number(linhaRelatorio.caixas_abertas), 1)
  })

  test('relatorioMetodoPagamento agrega valor recebido e nº de pagamentos por método', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 1500 })

    const metodo = await MetodoPagamento.create({ nome: 'Cartão', empresa_id: empresa.id } as any)
    await Vendapagamento.create({ venda_id: venda.id, metodo_pagamento_id: metodo.id, valor: 1000 })
    await Vendapagamento.create({ venda_id: venda.id, metodo_pagamento_id: metodo.id, valor: 500 })

    const repo = new RelatoriosRepository()
    const relatorio = (await repo.relatorioMetodoPagamento({ company_alias: empresa.company_alias })) as any[]
    const linha = relatorio.find((r) => r.metodo_pagamento_id === metodo.id)

    assert.isDefined(linha)
    assert.equal(Number(linha.pagamentos_quantidade), 2)
    assert.equal(Number(linha.valor_total), 1500)
  })

  test('relatorioStock agrega quantidade e valor em estoque (ao preço de compra) por produto', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa)
    await createLote(produto, { quantidade_em_estoque: 50, preco_compra: 300 })
    await createLote(produto, { quantidade_em_estoque: 20, preco_compra: 300 })

    const repo = new RelatoriosRepository()
    const relatorio = (await repo.relatorioStock({ company_alias: empresa.company_alias })) as any
    const linha = (relatorio as any[]).find((r) => r.produto_id === produto.id)

    assert.isDefined(linha)
    assert.equal(Number(linha.quantidade_em_estoque), 70)
    assert.equal(Number(linha.valor_em_estoque), 21000)
  })

  test('relatorioCompras agrega movimentações de entrada de estoque, num período', async ({ assert }) => {
    const { empresa, pos, user } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { preco_compra: 250 })

    const estoqueRepo = new EstoqueRepository()
    await estoqueRepo.create({
      pos_id: pos.id,
      registrado_por: user.id,
      motivo: 'compra',
      tipo_movimentacao: 'entrada',
      quantidade: 10,
      lote_produto_id: lote.id,
      company_alias: empresa.company_alias,
    } as any)

    const repo = new RelatoriosRepository()
    const relatorio = await repo.relatorioCompras({ company_alias: empresa.company_alias })

    assert.equal(relatorio.resumo.quantidade_total, 10)
    assert.equal(relatorio.resumo.valor_total, 2500)
    assert.lengthOf(relatorio.compras, 1)
    assert.equal((relatorio.compras as any)[0].produto_id, produto.id)
  })

  test('relatorioLucro calcula receita, custo e margem agregados por período (granularidade mês)', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 3000 })

    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { preco_venda: 1000, preco_compra: 400 })
    await createVendaItem(venda, lote, { quantidade: 3, preco_unitario: 1000 })

    const repo = new RelatoriosRepository()
    const linhas = await repo.relatorioLucro({ company_alias: empresa.company_alias, granularidade: 'mes' })

    assert.lengthOf(linhas, 1)
    assert.equal(linhas[0].receita, 3000)
    assert.equal(linhas[0].custo, 1200)
    assert.equal(linhas[0].lucro, 1800)
    assert.equal(linhas[0].margem, 60)
  })

  test('relatorioImpostos devolve periodos=[] quando a empresa não está no regime de IVA', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'fechada', total: 1000 })

    const repo = new RelatoriosRepository()
    const resultado = await repo.relatorioImpostos({ company_alias: empresa.company_alias })

    // `empresa.regime_iva` vem do mysql2 como 0/1 (TINYINT) — `relatorioImpostos()`
    // faz `Boolean(...)` neste ramo para nunca devolver o valor em bruto ao cliente.
    assert.isFalse(resultado.regime_iva)
    assert.isNull(resultado.taxa_percentual)
    assert.lengthOf(resultado.periodos, 0)
  })

  test('relatorioImpostos calcula o IVA liquidado por período quando a empresa está no regime', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'fechada', total: 11400 })

    const taxaRepo = new TaxaIvaRepository()
    const taxa = await taxaRepo.create({ nome: 'Taxa Geral', percentual: 14 })
    const empresaModel = await Empresa.findByOrFail('company_alias', empresa.company_alias)
    empresaModel.regime_iva = true
    empresaModel.taxa_iva_id = taxa.id
    await empresaModel.save()

    const repo = new RelatoriosRepository()
    const resultado = await repo.relatorioImpostos({ company_alias: empresa.company_alias, granularidade: 'mes' })

    assert.isTrue(resultado.regime_iva)
    assert.equal(resultado.taxa_percentual, 14)
    assert.lengthOf(resultado.periodos, 1)
    assert.equal(resultado.periodos[0].faturacao_total, 11400)
    // 11400 já inclui 14% de IVA: 11400 * 14 / 114 = 1400
    assert.equal(resultado.periodos[0].iva_liquidado, 1400)
  })

  test('relatorioDescontos agrega vendas com desconto e devolve o detalhe por cupão', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)

    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'Promotor Descontos',
      email: `pd-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupom = await cupomRepo.create({ promotor_id: promotor.id, desconto: 10, company_alias: empresa.company_alias })

    const vendaComDesconto = await createVenda(caixa, { status: 'fechada', total: 1800 })
    vendaComDesconto.valor_desconto = 200
    vendaComDesconto.cupom_id = cupom.id
    await vendaComDesconto.save()

    await createVenda(caixa, { status: 'fechada', total: 500 }) // sem desconto

    const repo = new RelatoriosRepository()
    const resultado = await repo.relatorioDescontos({ company_alias: empresa.company_alias })

    assert.equal(resultado.resumo.vendas_quantidade, 1)
    assert.equal(resultado.resumo.desconto_total, 200)
    assert.lengthOf(resultado.por_cupom, 1)
    assert.equal((resultado.por_cupom as any)[0].cupom_id, cupom.id)
    assert.equal(Number((resultado.por_cupom as any)[0].desconto_total), 200)
  })

  test('relatorioRentabilidade ordena por margem percentual (mais rentável primeiro)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)

    // margem alta: receita 2000, custo 400 -> 80%
    const produtoAlto = await createProduto(empresa, { nome: `Alta margem ${Date.now()}` })
    const loteAlto = await createLote(produtoAlto, { preco_venda: 1000, preco_compra: 200 })
    const vendaAlta = await createVenda(caixa, { status: 'fechada', total: 2000 })
    await createVendaItem(vendaAlta, loteAlto, { quantidade: 2, preco_unitario: 1000 })

    // margem baixa: receita 2000, custo 1800 -> 10%
    const produtoBaixo = await createProduto(empresa, { nome: `Baixa margem ${Date.now()}` })
    const loteBaixo = await createLote(produtoBaixo, { preco_venda: 1000, preco_compra: 900 })
    const vendaBaixa = await createVenda(caixa, { status: 'fechada', total: 2000 })
    await createVendaItem(vendaBaixa, loteBaixo, { quantidade: 2, preco_unitario: 1000 })

    const repo = new RelatoriosRepository()
    const linhas = await repo.relatorioRentabilidade({ company_alias: empresa.company_alias })

    const idxAlto = linhas.findIndex((r) => r.produto_id === produtoAlto.id)
    const idxBaixo = linhas.findIndex((r) => r.produto_id === produtoBaixo.id)

    assert.isTrue(idxAlto < idxBaixo)
    assert.equal(linhas[idxAlto].margem_percentual, 80)
    assert.equal(linhas[idxBaixo].margem_percentual, 10)
  })
})
