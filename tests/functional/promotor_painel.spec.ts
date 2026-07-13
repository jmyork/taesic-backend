import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import PromotorRepository from '#repositories/promotor_repository'
import CupomRepository from '#repositories/cupom_repository'
import VendasRepository from '#repositories/vendas_repository'
import PromotorPainelRepository from '#repositories/promotor_painel_repository'
import LeadRepository from '#repositories/lead_repository'
import {
  createTenant,
  createProduto,
  createLote,
  createCaixa,
  createVenda,
  createVendaItem,
} from '../helpers/fixtures.js'

test.group('promotor_painel_repository', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('vendasPorLoja e produtosComprados só contam vendas fechadas com o cupão do promotor', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa, { nome: 'Xarope XPTO' })
    const lote = await createLote(produto, { preco_venda: 1000 })
    const caixa = await createCaixa(user, pos)

    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'Painel Promotor',
      email: `painel-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupom = await cupomRepo.create({ promotor_id: promotor.id, desconto: 10, company_alias: empresa.company_alias })

    // venda 1: fechada, usa o cupão do promotor
    const venda1 = await createVenda(caixa)
    await createVendaItem(venda1, lote, { quantidade: 2, preco_unitario: 1000 })
    const vendasRepo = new VendasRepository()
    await vendasRepo.close({ id: venda1.id, user_id: user.id, company_alias: empresa.company_alias, cupom_codigo: cupom.codigo })

    // venda 2: fechada, SEM cupão nenhum — não deve entrar nas contas do promotor
    const venda2 = await createVenda(caixa)
    await createVendaItem(venda2, lote, { quantidade: 5, preco_unitario: 1000 })
    await vendasRepo.close({ id: venda2.id, user_id: user.id, company_alias: empresa.company_alias })

    const painelRepo = new PromotorPainelRepository()
    const vendasPorLoja = await painelRepo.vendasPorLoja(promotor.id)
    assert.lengthOf(vendasPorLoja, 1)
    assert.equal(vendasPorLoja[0].empresa_nome, empresa.nome)
    assert.equal(Number(vendasPorLoja[0].vendas_quantidade), 1)
    assert.equal(Number(vendasPorLoja[0].vendas_total), 1800) // 2000 - 10%

    const produtos = await painelRepo.produtosComprados(promotor.id)
    assert.lengthOf(produtos, 1)
    assert.equal(produtos[0].produto_nome, 'Xarope XPTO')
    assert.equal(Number(produtos[0].quantidade_total), 2)
  })

  test('leadsTotal e leadsPorLoja contam os cliques registados no perfil do promotor', async ({ assert }) => {
    const { empresa } = await createTenant()
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'Leads Promotor',
      email: `leads-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })

    const leadRepo = new LeadRepository()
    await leadRepo.registar(promotor.id, empresa.id)
    await leadRepo.registar(promotor.id, empresa.id)
    await leadRepo.registar(promotor.id, empresa.id)

    const painelRepo = new PromotorPainelRepository()
    const total = await painelRepo.leadsTotal(promotor.id)
    assert.equal(total, 3)

    const porLoja = await painelRepo.leadsPorLoja(promotor.id)
    assert.lengthOf(porLoja, 1)
    assert.equal(Number(porLoja[0].leads_quantidade), 3)
  })

  test('um promotor de plataforma pode ter vendas segmentadas por VÁRIAS lojas diferentes', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()

    const promotorRepo = new PromotorRepository()
    const promotorPlataforma = await promotorRepo.create({
      nome: 'Global',
      email: `global-${Date.now()}@example.com`,
    })

    const cupomRepo = new CupomRepository()
    const cupomA = await cupomRepo.create({
      promotor_id: promotorPlataforma.id,
      desconto: 5,
      company_alias: tenantA.empresa.company_alias,
    })
    const cupomB = await cupomRepo.create({
      promotor_id: promotorPlataforma.id,
      desconto: 5,
      company_alias: tenantB.empresa.company_alias,
    })

    const vendasRepo = new VendasRepository()

    const produtoA = await createProduto(tenantA.empresa)
    const loteA = await createLote(produtoA, { preco_venda: 1000 })
    const caixaA = await createCaixa(tenantA.user, tenantA.pos)
    const vendaA = await createVenda(caixaA)
    await createVendaItem(vendaA, loteA, { quantidade: 1, preco_unitario: 1000 })
    await vendasRepo.close({
      id: vendaA.id,
      user_id: tenantA.user.id,
      company_alias: tenantA.empresa.company_alias,
      cupom_codigo: cupomA.codigo,
    })

    const produtoB = await createProduto(tenantB.empresa)
    const loteB = await createLote(produtoB, { preco_venda: 2000 })
    const caixaB = await createCaixa(tenantB.user, tenantB.pos)
    const vendaB = await createVenda(caixaB)
    await createVendaItem(vendaB, loteB, { quantidade: 1, preco_unitario: 2000 })
    await vendasRepo.close({
      id: vendaB.id,
      user_id: tenantB.user.id,
      company_alias: tenantB.empresa.company_alias,
      cupom_codigo: cupomB.codigo,
    })

    const painelRepo = new PromotorPainelRepository()
    const vendasPorLoja = await painelRepo.vendasPorLoja(promotorPlataforma.id)
    assert.lengthOf(vendasPorLoja, 2)
    const nomes = vendasPorLoja.map((v: any) => v.empresa_nome).sort()
    assert.deepEqual(nomes, [tenantA.empresa.nome, tenantB.empresa.nome].sort())
  })
})
