import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import RelatoriosRepository from '#repositories/relatorios_repository'
import DespesasRepository from '#repositories/despesas_repository'
import TaxaIva from '#models/taxa_iva'
import FacturaRepository from '#repositories/factura_repository'
import Cliente from '#models/cliente'
import Empresa from '#models/empresa'
import Vendas from '#models/faturacao/vendas'
import Vendapagamento from '#models/vendapagamento'
import MetodoPagamento from '#models/metodopagamento'
import {
  createTenant,
  createCaixa,
  createVenda,
  createProduto,
  createLote,
  createVendaItem,
  createPos,
} from '../helpers/fixtures.js'

test.group('relatorios_repository - dashboard executivo, IVA, despesas, comparativo', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('dashboardExecutivo calcula faturação, ticket médio, nº de clientes e vendas por tipo', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)

    const cliente = await Cliente.create({ tipo: 'Pessoa Física', nome: 'Cliente A', empresa_id: empresa.id } as any)

    const vendaPresencial = await createVenda(caixa, { status: 'fechada', total: 1000 })
    vendaPresencial.cliente_presencial_id = cliente.id
    await vendaPresencial.save()

    const vendaOnline = await createVenda(caixa, { status: 'fechada', total: 500 })
    vendaOnline.venda_tipo = 'online'
    await vendaOnline.save()

    // não deve contar: ainda aberta
    await createVenda(caixa, { status: 'aberta', total: 9999 })

    const repo = new RelatoriosRepository()
    const dashboard = await repo.dashboardExecutivo({ company_alias: empresa.company_alias })

    assert.equal(dashboard.faturacao_mes.quantidade, 2)
    assert.equal(dashboard.faturacao_mes.total, 1500)
    assert.equal(dashboard.faturacao_hoje.total, 1500)
    assert.equal(dashboard.ticket_medio_mes, 750)
    assert.equal(dashboard.numero_clientes_mes, 1)
    assert.equal(dashboard.vendas_presenciais_mes.total, 1000)
    assert.equal(dashboard.vendas_online_mes.total, 500)
    assert.equal(dashboard.vendas_cliente_online_mes.total, 0)
    // sem conceito de venda a crédito ao cliente final neste projecto — ver comentário no repositório.
    assert.equal(dashboard.valor_por_receber_mes, 0)
  })

  test('dashboardExecutivo inclui as despesas do mês e o IVA liquidado quando a empresa está no regime', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'fechada', total: 11400 })

    const despesasRepo = new DespesasRepository()
    await despesasRepo.create({
      categoria: 'Renda',
      valor: 30000,
      data_despesa: new Date(),
      company_alias: empresa.company_alias,
      registrado_por: user.id,
    })

    const taxa = await TaxaIva.create({ nome: 'Taxa Geral', percentual: 14 })

    const empresaModel = await Empresa.findByOrFail('company_alias', empresa.company_alias)
    empresaModel.regime_iva = true
    empresaModel.taxa_iva_id = taxa.id
    await empresaModel.save()

    const repo = new RelatoriosRepository()
    const dashboard = await repo.dashboardExecutivo({ company_alias: empresa.company_alias })

    assert.equal(dashboard.despesas_mes, 30000)
    // 11400 já inclui 14% de IVA: 11400 * 14 / 114 = 1400
    assert.equal(dashboard.iva_liquidado_mes, 1400)
  })

  test('dashboardExecutivo devolve iva_liquidado_mes = null quando a empresa não está no regime de IVA', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'fechada', total: 1000 })

    const repo = new RelatoriosRepository()
    const dashboard = await repo.dashboardExecutivo({ company_alias: empresa.company_alias })

    assert.isNull(dashboard.iva_liquidado_mes)
  })

  test('dashboardExecutivo isola por tenant — nunca conta vendas de outra empresa', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()

    const caixaA = await createCaixa(tenantA.user, tenantA.pos)
    await createVenda(caixaA, { status: 'fechada', total: 1000 })

    const caixaB = await createCaixa(tenantB.user, tenantB.pos)
    await createVenda(caixaB, { status: 'fechada', total: 99999 })

    const repo = new RelatoriosRepository()
    const dashboardA = await repo.dashboardExecutivo({ company_alias: tenantA.empresa.company_alias })

    assert.equal(dashboardA.faturacao_mes.total, 1000)
  })

  test('kpisGerais devolve o mesmo conjunto que dashboardExecutivo', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'fechada', total: 750 })

    const repo = new RelatoriosRepository()
    const kpis = await repo.kpisGerais({ company_alias: empresa.company_alias })

    assert.equal(kpis.faturacao_mes.total, 750)
  })

  test('comparativo hoje_ontem calcula a variação entre os dois períodos', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const vendaHoje = await createVenda(caixa, { status: 'fechada', total: 1500 })

    // simula uma venda "de ontem" recuando created_at
    const ontem = DateTime.now().minus({ days: 1 })
    await createVenda(caixa, { status: 'fechada', total: 1000 })
    await Vendas.query()
      .where('id', '!=', vendaHoje.id)
      .update({ created_at: ontem.toFormat('yyyy-MM-dd HH:mm:ss') })

    const repo = new RelatoriosRepository()
    const comparativo = await repo.comparativo({
      company_alias: empresa.company_alias,
      tipo_comparativo: 'hoje_ontem',
    })

    assert.equal(comparativo.atual.total, 1500)
    assert.equal(comparativo.anterior.total, 1000)
    assert.equal(comparativo.variacao_absoluta, 500)
    assert.equal(comparativo.variacao_percentual, 50)
  })

  test('relatorioDocumentosAnulados e relatorioNotasCredito reflectem o estado/tipo da factura', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda1 = await createVenda(caixa, { status: 'fechada', total: 1000 })
    const venda2 = await createVenda(caixa, { status: 'fechada', total: 2000 })

    const facturaRepo = new FacturaRepository()
    const factura1 = await facturaRepo.emitir({ venda_id: venda1.id, tipo: 'Factura', company_alias: empresa.company_alias })
    await facturaRepo.anular({ id: factura1.id, company_alias: empresa.company_alias, motivo_anulacao: 'I' })

    /*
     * A nota de crédito tem de dizer o que rectifica — a AGT recusa-a com E13 sem
     * essa referência, e o art.º 10.º do Decreto Presidencial 71/25 exige-a. Daí a
     * factura da venda 2 nascer primeiro: até esta passagem, este teste emitia a
     * nota agarrada a uma venda e sem origem nenhuma, o que já não é um documento
     * válido.
     */
    const factura2 = await facturaRepo.emitir({ venda_id: venda2.id, tipo: 'Factura', company_alias: empresa.company_alias })
    await facturaRepo.emitir({ tipo: 'Nota de Crédito', documento_origem_id: factura2.id, total: 500, company_alias: empresa.company_alias })

    const repo = new RelatoriosRepository()
    const anulados = await repo.relatorioDocumentosAnulados({ company_alias: empresa.company_alias })
    const notasCredito = await repo.relatorioNotasCredito({ company_alias: empresa.company_alias })

    assert.lengthOf(anulados, 1)
    assert.equal((anulados as any)[0].id, factura1.id)
    assert.lengthOf(notasCredito, 1)
    assert.equal((notasCredito as any)[0].tipo, 'Nota de Crédito')
  })

  test('fluxoCaixa junta entradas (pagamentos) e saídas (despesas) por dia', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 2000 })

    const metodo = await MetodoPagamento.create({ nome: 'Numerário', empresa_id: empresa.id } as any)
    await Vendapagamento.create({ venda_id: venda.id, metodo_pagamento_id: metodo.id, valor: 2000 })

    const despesasRepo = new DespesasRepository()
    await despesasRepo.create({
      categoria: 'Renda',
      valor: 800,
      data_despesa: new Date(),
      company_alias: empresa.company_alias,
      registrado_por: user.id,
    })

    const repo = new RelatoriosRepository()
    const fluxo = await repo.fluxoCaixa({ company_alias: empresa.company_alias })

    assert.lengthOf(fluxo, 1)
    assert.equal(fluxo[0].entradas, 2000)
    assert.equal(fluxo[0].saidas, 800)
    assert.equal(fluxo[0].saldo_dia, 1200)
    assert.equal(fluxo[0].saldo_acumulado, 1200)
  })
})

test.group('relatorios_repository - produtos, vendas e filtros', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('topProdutos e relatorioProdutos agregam quantidade/receita/custo por produto', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 3000 })

    const produto = await createProduto(empresa, { nome: `Produto Top ${Date.now()}` })
    const lote = await createLote(produto, { preco_venda: 1000, preco_compra: 400 })
    await createVendaItem(venda, lote, { quantidade: 3, preco_unitario: 1000 })

    const repo = new RelatoriosRepository()
    const top = await repo.topProdutos({ company_alias: empresa.company_alias })
    const linhaTop = top.find((r: any) => r.produto_id === produto.id)
    assert.isDefined(linhaTop)
    assert.equal(Number(linhaTop.quantidade_vendida), 3)
    assert.equal(Number(linhaTop.receita_total), 3000)

    const relatorio = await repo.relatorioProdutos({ company_alias: empresa.company_alias })
    const linhaRelatorio = relatorio.find((r: any) => r.produto_id === produto.id)
    assert.equal(Number(linhaRelatorio.custo_total), 1200)
  })

  test('relatorioVendas filtra por pos_id e por cliente_id, e devolve o resumo agregado', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const outroPos = await createPos(empresa)

    const caixaA = await createCaixa(user, pos)
    const caixaB = await createCaixa(user, outroPos)

    const cliente = await Cliente.create({ tipo: 'Pessoa Física', nome: 'Cliente Filtro', empresa_id: empresa.id } as any)

    const vendaA = await createVenda(caixaA, { status: 'fechada', total: 1000 })
    vendaA.cliente_presencial_id = cliente.id
    await vendaA.save()

    await createVenda(caixaB, { status: 'fechada', total: 5000 })

    const repo = new RelatoriosRepository()
    const porPos = await repo.relatorioVendas({ company_alias: empresa.company_alias, pos_id: pos.id })
    assert.equal(porPos.resumo.quantidade, 1)
    assert.equal(porPos.resumo.total, 1000)

    const porCliente = await repo.relatorioVendas({ company_alias: empresa.company_alias, cliente_id: cliente.id })
    assert.equal(porCliente.resumo.quantidade, 1)
    assert.equal(porCliente.resumo.total, 1000)
  })

  /**
   * O relatório devolvia só ids/totais — sem número de factura, cliente nem vendedor
   * não é possível montar uma tabela legível no ecrã de Relatórios de Vendas.
   */
  test('relatorioVendas devolve numero, cliente e vendedor para a tabela do relatório', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const cliente = await Cliente.create({
      tipo: 'Pessoa Jurídica',
      nome: 'Cliente Do Relatório',
      nif: '5002889978',
      empresa_id: empresa.id,
    } as any)

    const venda = await createVenda(caixa, { status: 'fechada', total: 7500 })
    venda.cliente_presencial_id = cliente.id
    venda.empresa_id = empresa.id
    venda.numero = 42
    await venda.save()

    const repo = new RelatoriosRepository()
    const r = await repo.relatorioVendas({ company_alias: empresa.company_alias })
    const linha = (r.vendas.all() as any[]).find((v) => v.id === venda.id)

    assert.exists(linha)
    assert.equal(Number(linha.numero), 42)
    assert.equal(linha.cliente_nome, 'Cliente Do Relatório')
    assert.equal(linha.cliente_nif, '5002889978')
    assert.equal(linha.vendedor_nome, user.username)
  })

  test('relatorioVendas inclui vendas SEM cliente (o join tem de ser opcional)', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 300 })

    const repo = new RelatoriosRepository()
    const r = await repo.relatorioVendas({ company_alias: empresa.company_alias })
    const linha = (r.vendas.all() as any[]).find((v) => v.id === venda.id)

    assert.exists(linha, 'uma venda a Cliente Final não pode sumir do relatório')
    assert.isNull(linha.cliente_nome)
  })
})
