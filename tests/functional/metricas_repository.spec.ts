import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import MetricasRepository from '#repositories/metricas_repository'
import VendasRepository from '#repositories/vendas_repository'
import PromotorRepository from '#repositories/promotor_repository'
import CupomRepository from '#repositories/cupom_repository'
import LeadRepository from '#repositories/lead_repository'
import {
  createTenant,
  createProduto,
  createLote,
  createCaixa,
  createVenda,
  createVendaItem,
  createPos,
  createUser,
} from '../helpers/fixtures.js'

test.group('metricas_repository', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('resumo: conta só vendas fechadas de hoje/do mês, ignora abertas/canceladas/reembolsadas', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 100 })
    const caixa = await createCaixa(user, pos)

    // uma venda fechada de verdade (via close(), que também gera o movimento de stock)
    const vendaFechada = await createVenda(caixa)
    await createVendaItem(vendaFechada, lote, { quantidade: 2, preco_unitario: 1000 })
    const vendasRepo = new VendasRepository()
    await vendasRepo.close({ id: vendaFechada.id, user_id: user.id, company_alias: empresa.company_alias })

    // uma venda ainda aberta — não deve contar para a receita
    await createVenda(caixa, { status: 'aberta' })
    // uma venda cancelada — não deve contar
    await createVenda(caixa, { status: 'cancelada' })

    const metricas = new MetricasRepository()
    const resumo = await metricas.resumo({ company_alias: empresa.company_alias })

    assert.equal(resumo.vendas_hoje.quantidade, 1)
    assert.equal(resumo.vendas_hoje.total, 2000)
    assert.equal(resumo.vendas_mes.quantidade, 1)
    assert.equal(resumo.vendas_mes.total, 2000)
    assert.equal(resumo.ticket_medio_mes, 2000)
    assert.equal(resumo.caixas_abertas, 1) // a caixa continua aberta (só a venda fechou)
  })

  test('resumo: conta lotes a expirar nos próximos 30 dias, ignora os que já expiraram e os que expiram depois', async ({
    assert,
  }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa)

    const loteExpiraEm15Dias = await createLote(produto)
    loteExpiraEm15Dias.data_validade = DateTime.now().plus({ days: 15 }).toJSDate() as any
    await loteExpiraEm15Dias.save()

    const loteExpiraEm60Dias = await createLote(produto)
    loteExpiraEm60Dias.data_validade = DateTime.now().plus({ days: 60 }).toJSDate() as any
    await loteExpiraEm60Dias.save()

    const loteJaExpirado = await createLote(produto)
    loteJaExpirado.data_validade = DateTime.now().minus({ days: 5 }).toJSDate() as any
    await loteJaExpirado.save()

    const metricas = new MetricasRepository()
    const resumo = await metricas.resumo({ company_alias: empresa.company_alias })

    assert.equal(resumo.lotes_a_expirar, 1)
  })

  test('resumo: isola por empresa (nunca mistura vendas/caixas de outro tenant)', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()

    const produtoA = await createProduto(tenantA.empresa)
    const loteA = await createLote(produtoA)
    const caixaA = await createCaixa(tenantA.user, tenantA.pos)
    const vendaA = await createVenda(caixaA)
    await createVendaItem(vendaA, loteA, { quantidade: 1, preco_unitario: 5000 })
    const vendasRepo = new VendasRepository()
    await vendasRepo.close({ id: vendaA.id, user_id: tenantA.user.id, company_alias: tenantA.empresa.company_alias })

    const metricas = new MetricasRepository()
    const resumoB = await metricas.resumo({ company_alias: tenantB.empresa.company_alias })

    assert.equal(resumoB.vendas_hoje.quantidade, 0)
    assert.equal(resumoB.vendas_hoje.total, 0)
    assert.equal(resumoB.caixas_abertas, 0)
  })

  test('porPosto: agrega vendas fechadas por ponto de venda, inclui postos sem nenhuma venda com zero', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const posSemVendas = await createPos(empresa)

    const produto = await createProduto(empresa)
    const lote = await createLote(produto)
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 2, preco_unitario: 1500 })
    const vendasRepo = new VendasRepository()
    await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    const metricas = new MetricasRepository()
    const resultado = await metricas.porPosto({ company_alias: empresa.company_alias })

    const linhaComVendas = resultado.find((r: any) => r.pos_id === pos.id)
    assert.exists(linhaComVendas)
    assert.equal(Number(linhaComVendas.vendas_quantidade), 1)
    assert.equal(Number(linhaComVendas.vendas_total), 3000)

    const linhaSemVendas = resultado.find((r: any) => r.pos_id === posSemVendas.id)
    assert.exists(linhaSemVendas)
    assert.equal(Number(linhaSemVendas.vendas_quantidade), 0)
    assert.equal(Number(linhaSemVendas.vendas_total ?? 0), 0)
  })

  test('porVendedor: agrega vendas fechadas por utilizador que tinha a caixa', async ({ assert }) => {
    const { empresa, pos } = await createTenant()
    const vendedorA = await createUser(empresa)
    const vendedorB = await createUser(empresa)

    const produto = await createProduto(empresa)
    const loteA = await createLote(produto)
    const caixaA = await createCaixa(vendedorA, pos)
    const vendaA = await createVenda(caixaA)
    await createVendaItem(vendaA, loteA, { quantidade: 1, preco_unitario: 4000 })
    const vendasRepo = new VendasRepository()
    await vendasRepo.close({ id: vendaA.id, user_id: vendedorA.id, company_alias: empresa.company_alias })

    const metricas = new MetricasRepository()
    const resultado = await metricas.porVendedor({ company_alias: empresa.company_alias })

    const linhaVendedorA = resultado.find((r: any) => r.user_id === vendedorA.id)
    const linhaVendedorB = resultado.find((r: any) => r.user_id === vendedorB.id)
    assert.exists(linhaVendedorA)
    assert.equal(Number(linhaVendedorA.vendas_quantidade), 1)
    assert.equal(Number(linhaVendedorA.vendas_total), 4000)
    assert.notExists(linhaVendedorB) // nunca vendeu nada, não deve aparecer com juntas vazias duplicadas
  })

  test('porDia: agrupa vendas fechadas por dia de calendário, somando quantidade/total no mesmo dia e mantendo dias diferentes separados e ordenados', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)

    const dia1Manha = DateTime.fromISO('2024-03-10T09:00:00')
    const dia1Tarde = DateTime.fromISO('2024-03-10T18:00:00')
    const dia2 = DateTime.fromISO('2024-03-11T10:00:00')

    const vendaA = await createVenda(caixa, { status: 'fechada', total: 1000 })
    vendaA.createdAt = dia1Manha
    await vendaA.save()

    const vendaB = await createVenda(caixa, { status: 'fechada', total: 2000 })
    vendaB.createdAt = dia1Tarde
    await vendaB.save()

    const vendaC = await createVenda(caixa, { status: 'fechada', total: 500 })
    vendaC.createdAt = dia2
    await vendaC.save()

    const metricas = new MetricasRepository()
    const resultado = await metricas.porDia({
      company_alias: empresa.company_alias,
      data_inicio: DateTime.fromISO('2024-03-01').toJSDate(),
      data_fim: DateTime.fromISO('2024-03-31').toJSDate(),
    })

    assert.lengthOf(resultado, 2)
    assert.equal((resultado[0] as any).data, '2024-03-10') // ordenado ascendente por data
    assert.equal((resultado[1] as any).data, '2024-03-11')

    const linhaDia1 = resultado.find((r: any) => r.data === '2024-03-10') as any
    const linhaDia2 = resultado.find((r: any) => r.data === '2024-03-11') as any
    assert.exists(linhaDia1)
    assert.equal(Number(linhaDia1.vendas_quantidade), 2)
    assert.equal(Number(linhaDia1.vendas_total), 3000)
    assert.exists(linhaDia2)
    assert.equal(Number(linhaDia2.vendas_quantidade), 1)
    assert.equal(Number(linhaDia2.vendas_total), 500)
  })

  test('porDia: isola por empresa (venda fechada de outro tenant no mesmo dia nunca aparece)', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()

    const caixaA = await createCaixa(tenantA.user, tenantA.pos)
    const caixaB = await createCaixa(tenantB.user, tenantB.pos)

    const dia = DateTime.fromISO('2024-04-05T12:00:00')

    const vendaA = await createVenda(caixaA, { status: 'fechada', total: 1500 })
    vendaA.createdAt = dia
    await vendaA.save()

    const vendaB = await createVenda(caixaB, { status: 'fechada', total: 9999 })
    vendaB.createdAt = dia
    await vendaB.save()

    const metricas = new MetricasRepository()
    const resultado = await metricas.porDia({
      company_alias: tenantA.empresa.company_alias,
      data_inicio: DateTime.fromISO('2024-04-01').toJSDate(),
      data_fim: DateTime.fromISO('2024-04-30').toJSDate(),
    })

    assert.lengthOf(resultado, 1)
    assert.equal((resultado[0] as any).data, '2024-04-05')
    assert.equal(Number((resultado[0] as any).vendas_quantidade), 1)
    assert.equal(Number((resultado[0] as any).vendas_total), 1500)
  })

  test('porDia: só conta vendas fechadas — uma venda aberta/cancelada no mesmo dia não entra no total do dia', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)

    const dia = DateTime.fromISO('2024-05-20T08:00:00')

    const vendaFechada = await createVenda(caixa, { status: 'fechada', total: 3000 })
    vendaFechada.createdAt = dia
    await vendaFechada.save()

    const vendaAberta = await createVenda(caixa, { status: 'aberta', total: 700 })
    vendaAberta.createdAt = dia
    await vendaAberta.save()

    const vendaCancelada = await createVenda(caixa, { status: 'cancelada', total: 800 })
    vendaCancelada.createdAt = dia
    await vendaCancelada.save()

    const metricas = new MetricasRepository()
    const resultado = await metricas.porDia({
      company_alias: empresa.company_alias,
      data_inicio: DateTime.fromISO('2024-05-01').toJSDate(),
      data_fim: DateTime.fromISO('2024-05-31').toJSDate(),
    })

    assert.lengthOf(resultado, 1)
    assert.equal((resultado[0] as any).data, '2024-05-20')
    assert.equal(Number((resultado[0] as any).vendas_quantidade), 1)
    assert.equal(Number((resultado[0] as any).vendas_total), 3000)
  })

  test('promotoresResumo: agrega vendas/desconto/promotores ativos/leads de TODOS os promotores desta empresa', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { preco_venda: 1000 })
    const caixa = await createCaixa(user, pos)

    const promotorRepo = new PromotorRepository()
    const promotorA = await promotorRepo.create({
      nome: 'Promotor A',
      email: `resumoA-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const promotorB = await promotorRepo.create({
      nome: 'Promotor B',
      email: `resumoB-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupomA = await cupomRepo.create({ promotor_id: promotorA.id, desconto: 10, company_alias: empresa.company_alias })
    const cupomB = await cupomRepo.create({ promotor_id: promotorB.id, desconto: 20, company_alias: empresa.company_alias })

    const vendasRepo = new VendasRepository()

    const vendaA = await createVenda(caixa)
    await createVendaItem(vendaA, lote, { quantidade: 2, preco_unitario: 1000 }) // subtotal 2000
    await vendasRepo.close({ id: vendaA.id, user_id: user.id, company_alias: empresa.company_alias, cupom_codigo: cupomA.codigo })

    const vendaB = await createVenda(caixa)
    await createVendaItem(vendaB, lote, { quantidade: 1, preco_unitario: 1000 }) // subtotal 1000
    await vendasRepo.close({ id: vendaB.id, user_id: user.id, company_alias: empresa.company_alias, cupom_codigo: cupomB.codigo })

    // venda sem cupão nenhum — não deve entrar nas contas de promotores
    const vendaSemCupom = await createVenda(caixa)
    await createVendaItem(vendaSemCupom, lote, { quantidade: 5, preco_unitario: 1000 })
    await vendasRepo.close({ id: vendaSemCupom.id, user_id: user.id, company_alias: empresa.company_alias })

    const leadRepo = new LeadRepository()
    await leadRepo.registar(promotorA.id, empresa.id)
    await leadRepo.registar(promotorA.id, empresa.id)

    const metricas = new MetricasRepository()
    const resumo = await metricas.promotoresResumo({ company_alias: empresa.company_alias })

    assert.equal(resumo.vendas_quantidade, 2)
    assert.equal(resumo.vendas_total, 1800 + 800) // 2000-10% + 1000-20%
    assert.equal(resumo.valor_desconto_total, 200 + 200)
    assert.equal(resumo.promotores_ativos_quantidade, 2)
    assert.equal(resumo.leads_quantidade, 2)
  })

  test('promotoresPorPromotor: agrega por promotor, ordenado por receita, exclui quem não vendeu nada', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { preco_venda: 1000 })
    const caixa = await createCaixa(user, pos)

    const promotorRepo = new PromotorRepository()
    const promotorTop = await promotorRepo.create({
      nome: 'Top Seller',
      email: `top-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const promotorSemVendas = await promotorRepo.create({
      nome: 'Sem Vendas',
      email: `semvendas-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupomTop = await cupomRepo.create({ promotor_id: promotorTop.id, desconto: 0, company_alias: empresa.company_alias })
    await cupomRepo.create({ promotor_id: promotorSemVendas.id, desconto: 0, company_alias: empresa.company_alias })

    const vendasRepo = new VendasRepository()
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 3, preco_unitario: 1000 })
    await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias, cupom_codigo: cupomTop.codigo })

    const metricas = new MetricasRepository()
    const resultado = await metricas.promotoresPorPromotor({ company_alias: empresa.company_alias })

    assert.lengthOf(resultado, 1)
    assert.equal((resultado[0] as any).promotor_nome, 'Top Seller')
    assert.equal(Number((resultado[0] as any).vendas_total), 3000)
  })

  test('promotoresPorProduto: agrega produtos comprados via cupão de QUALQUER promotor, isolado por empresa', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const outraEmpresa = await createTenant()
    const produto = await createProduto(empresa, { nome: 'Produto Promovido' })
    const lote = await createLote(produto, { preco_venda: 1000 })
    const caixa = await createCaixa(user, pos)

    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'P',
      email: `produto-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupom = await cupomRepo.create({ promotor_id: promotor.id, desconto: 0, company_alias: empresa.company_alias })

    const vendasRepo = new VendasRepository()
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 4, preco_unitario: 1000 })
    await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias, cupom_codigo: cupom.codigo })

    const metricas = new MetricasRepository()
    const resultado = await metricas.promotoresPorProduto({ company_alias: empresa.company_alias })
    const resultadoOutraEmpresa = await metricas.promotoresPorProduto({
      company_alias: outraEmpresa.empresa.company_alias,
    })

    assert.lengthOf(resultado, 1)
    assert.equal((resultado[0] as any).produto_nome, 'Produto Promovido')
    assert.equal(Number((resultado[0] as any).quantidade_total), 4)
    assert.equal(Number((resultado[0] as any).valor_total), 4000)
    assert.lengthOf(resultadoOutraEmpresa, 0)
  })
})
