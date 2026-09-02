import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import CaixaRepository from '#repositories/caixa_repository'
import VendasRepository from '#repositories/vendas_repository'
import VendaItensRepository from '#repositories/venda_itens_repository'
import ProdutosReembolsoRepository from '#repositories/produtos_reembolso_repository'
import Lote from '#models/faturacao/lote'
import Vendas from '#models/faturacao/vendas'
import Factura from '#models/faturacao/factura'
import { createTenant, createProduto, createLote, pagarVenda } from '../helpers/fixtures.js'

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
    assert.equal(caixa.status.toLocaleLowerCase(), 'aberto')

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
    await pagarVenda(venda, 2000)
    const vendaFechada = await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: companyAlias })
    assert.equal(vendaFechada.status, 'fechada')
    assert.equal(Number(vendaFechada.total), 2000)

    const loteAposFecho = await Lote.findOrFail(lote.id)
    assert.equal(Number(loteAposFecho.quantidade_em_estoque), 48)

    /*
     * 5. O DOCUMENTO FISCAL já existe — foi emitido pelo próprio fecho.
     *
     * Este passo era uma segunda chamada, à mão, a `facturaRepo.emitir()`. Deixou de
     * poder ser: o fecho da venda passou a emitir o documento dentro da sua própria
     * transacção, e uma emissão manual por cima recusa-se com `VendaJaFacturada` —
     * que é exactamente a regra a funcionar.
     *
     * Sem cliente indicado e a pronto pagamento, o documento é uma FACTURA GENÉRICA:
     * não há NIF que o documento possa nomear, e é esse o documento que o decreto
     * tem para o caso. Ver `documentoDaVenda()`.
     */
    const factura = await Factura.query()
      .where('venda_id', venda.id)
      .whereNull('deleted_at')
      .firstOrFail()

    assert.equal(factura.tipo, 'Factura Genérica', 'venda a pronto pagamento e sem NIF')
    assert.equal(factura.numero, 1)
    assert.equal(Number(factura.total), 2000)
    assert.isNull(
      factura.data_vencimento,
      'paga no acto — não pode aparecer no mapa de contas a receber'
    )

    // E vem junto com a venda que o fecho devolveu, para o ponto de venda o poder
    // imprimir sem um segundo pedido.
    assert.equal((vendaFechada.$extras.documento as any)?.id, factura.id)

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

    // A NOTA DE CRÉDITO do reembolso, pela diferença (2000 -> 1000).
    const notaDeCredito = await Factura.query()
      .where('documento_origem_id', factura.id)
      .where('tipo', 'Nota de Crédito')
      .whereNull('deleted_at')
      .firstOrFail()

    assert.equal(Number(notaDeCredito.total), 1000)

    // 7. Fechar o caixa
    const caixaFechado = await caixaRepo.close(caixa.id, { user_id: user.id, company_alias: companyAlias })
    assert.equal(caixaFechado.status.toLocaleLowerCase(), 'fechado')
  })
})
