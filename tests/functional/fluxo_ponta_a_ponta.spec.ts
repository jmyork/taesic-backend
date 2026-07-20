import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import CaixaRepository from '#repositories/caixa_repository'
import VendasRepository from '#repositories/vendas_repository'
import VendaItensRepository from '#repositories/venda_itens_repository'
import FacturaRepository from '#repositories/factura_repository'
import ProdutosReembolsoRepository from '#repositories/produtos_reembolso_repository'
import Lote from '#models/faturacao/lote'
import Vendas from '#models/faturacao/vendas'
import { createTenant, createProduto, createLote } from '../helpers/fixtures.js'

/**
 * Percorre o fluxo de negócio completo do PDV ponta-a-ponta, através dos repositórios
 * reais (não só cada peça isolada): abrir caixa → abrir venda → adicionar item → fechar
 * venda (decrementa stock) → emitir factura → reembolso parcial (devolve stock) → fechar
 * caixa. Cada transição já tinha teste próprio isolado; este cobre a composição real —
 * ex.: confirma que o stock que `close()` decrementa é o mesmo que `reembolsar_parcial()`
 * devolve, e que o total da venda e a numeração da factura reflectem o que realmente
 * aconteceu.
 */
test.group('fluxo ponta-a-ponta: caixa -> venda -> factura -> reembolso', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('percorre o fluxo completo sem inconsistências de stock/total/numeração', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const companyAlias = empresa.company_alias

    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 50, preco_venda: 1000 })

    // 1. Abrir caixa
    const caixaRepo = new CaixaRepository()
    const caixa = await caixaRepo.open({
      pos_id: pos.id,
      user_id: user.id,
      company_alias: companyAlias,
      valor_inicial: 0,
    })
    assert.equal(caixa.status, 'aberto')

    // 2. Abrir venda (presencial, no caixa que acabou de abrir)
    const vendasRepo = new VendasRepository()
    const venda = await vendasRepo.create({
      company_alias: companyAlias,
      user_id: user.id,
      venda_tipo: 'presencial',
    } as any)
    assert.equal(venda.status, 'aberta')
    assert.equal(venda.caixa_id, caixa.id)

    // 3. Adicionar 2 unidades à venda
    const itensRepo = new VendaItensRepository()
    await itensRepo.create({
      venda_id: venda.id,
      lote_produto_id: lote.id,
      quantidade: 2,
      company_alias: companyAlias,
    } as any)

    // 4. Fechar a venda — decrementa stock (50 -> 48) e fixa o total (2 x 1000)
    const vendaFechada = await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: companyAlias })
    assert.equal(vendaFechada.status, 'fechada')
    assert.equal(Number(vendaFechada.total), 2000)

    const loteAposFecho = await Lote.findOrFail(lote.id)
    assert.equal(Number(loteAposFecho.quantidade_em_estoque), 48)

    // 5. Emitir factura — numeração sequencial por empresa, começa em 1
    const facturaRepo = new FacturaRepository()
    const factura = await facturaRepo.emitir({
      company_alias: companyAlias,
      venda_id: venda.id,
      tipo: 'Factura',
    })
    assert.equal(factura.numero, 1)
    assert.equal(Number(factura.total), 2000)

    // 6. Reembolso parcial de 1 unidade — devolve stock (48 -> 49) e recalcula o total da venda
    const vendaItem = await itensRepo.paginate(1, 10, { venda_id: venda.id, company_alias: companyAlias })
    const reembolsoRepo = new ProdutosReembolsoRepository()
    await reembolsoRepo.reembolsar_parcial({
      venda_item_id: vendaItem[0].id,
      quantidade: 1,
      user_id: user.id,
      company_alias: companyAlias,
    } as any)

    const loteAposReembolso = await Lote.findOrFail(lote.id)
    assert.equal(Number(loteAposReembolso.quantidade_em_estoque), 49)

    const vendaAposReembolso = await Vendas.findOrFail(venda.id)
    assert.equal(Number(vendaAposReembolso.total), 1000)

    // 7. Fechar o caixa
    const caixaFechado = await caixaRepo.close(caixa.id, { user_id: user.id, company_alias: companyAlias })
    assert.equal(caixaFechado.status, 'fechado')
  })
})
