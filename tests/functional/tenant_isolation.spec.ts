import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import ClienteRepository from '#repositories/cliente_repository'
import VendapagamentoRepository from '#repositories/vendapagamento_repository'
import Vendapagamento from '#models/vendapagamento'
import { createTenant, createProduto, createLote, createCaixa, createVenda, createVendaItem } from '../helpers/fixtures.js'

/**
 * Regressão para o gap de isolamento multi-tenant encontrado na auditoria: cliente,
 * pessoa, vendapagamento, subscricao e cobranca não filtravam por `company_alias`,
 * permitindo a um tenant ler/alterar registos de outro. Este ficheiro cobre os dois
 * padrões de join usados nas correções: uma FK direta a `empresa` (cliente) e uma
 * cadeia de vários saltos (vendapagamento -> vendas -> caixa -> pos -> empresa).
 */
test.group('Isolamento multi-tenant', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('cliente_repository: uma empresa não vê nem acede aos clientes de outra', async ({ assert }) => {
    const { empresa: empresaA } = await createTenant()
    const { empresa: empresaB } = await createTenant()

    const repo = new ClienteRepository()
    const clienteA = await repo.create({ nome: 'Cliente A', company_alias: empresaA.company_alias } as any)
    await repo.create({ nome: 'Cliente B', company_alias: empresaB.company_alias } as any)

    const listaA = await repo.paginate(1, 20, null, empresaA.company_alias)
    assert.lengthOf(listaA, 1, 'a empresa A só deve ver o seu próprio cliente')
    assert.equal(listaA[0].nome, 'Cliente A')

    // a empresa B não pode aceder a um cliente da empresa A pelo id
    await assert.rejects(() => repo.findOrFail(clienteA.id, empresaB.company_alias))

    // sem company_alias (uso interno/plataforma) continua a ver tudo — não é o caminho tenant-scoped
    const listaSemFiltro = await repo.paginate(1, 20, null, undefined)
    assert.isAtLeast(listaSemFiltro.length, 2)
  })

  test('vendapagamento_repository: isolamento através da cadeia venda -> caixa -> pos -> empresa', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()

    const produtoA = await createProduto(tenantA.empresa)
    const loteA = await createLote(produtoA, { quantidade_em_estoque: 10 })
    const caixaA = await createCaixa(tenantA.user, tenantA.pos)
    const vendaA = await createVenda(caixaA)
    await createVendaItem(vendaA, loteA, { quantidade: 1, preco_unitario: 500 })

    const produtoB = await createProduto(tenantB.empresa)
    const loteB = await createLote(produtoB, { quantidade_em_estoque: 10 })
    const caixaB = await createCaixa(tenantB.user, tenantB.pos)
    const vendaB = await createVenda(caixaB)
    await createVendaItem(vendaB, loteB, { quantidade: 1, preco_unitario: 500 })

    const pagamentoA = await Vendapagamento.create({ venda_id: vendaA.id, valor: 500 } as any)
    await Vendapagamento.create({ venda_id: vendaB.id, valor: 500 } as any)

    const repo = new VendapagamentoRepository()

    const listaA = await repo.paginate(1, 20, null, tenantA.empresa.company_alias)
    assert.lengthOf(listaA, 1)
    assert.equal(listaA[0].id, pagamentoA.id)

    await assert.rejects(() => repo.findOrFail(pagamentoA.id, tenantB.empresa.company_alias))

    const foundByOwner = await repo.findOrFail(pagamentoA.id, tenantA.empresa.company_alias)
    assert.equal(foundByOwner.id, pagamentoA.id)
  })
})
