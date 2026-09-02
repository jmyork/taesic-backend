import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

import FacturaRepository from '#repositories/factura_repository'
import VendasRepository from '#repositories/vendas_repository'
import ProdutosReembolsoRepository from '#repositories/produtos_reembolso_repository'
import VendaItensRepository from '#repositories/venda_itens_repository'
import Cliente from '#models/cliente'
import Factura from '#models/faturacao/factura'
import Lote from '#models/faturacao/lote'
import VendaSemDocumentoException from '#exceptions/venda_sem_documento_exception'
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
 * Duas regras dadas pelo dono do produto, e uma que sai delas.
 *
 *   1. **Um reembolso tem de ter documento.** Devolver dinheiro reduz o valor de
 *      uma operação já declarada às Finanças; sem nota de crédito, o stock volta,
 *      a caixa desce, e o que foi declarado continua a dizer o valor cheio.
 *   2. **O stock tem de seguir o que acontece realmente.** Só volta ao armazém o
 *      que de lá saiu — e uma venda por adiantamento ainda não entregue nunca deu
 *      baixa nenhuma.
 *   3. **A autofacturação tem de ser possível.** Era emitível e inútil: não havia
 *      forma de nomear o fornecedor, que é a única coisa que a define.
 */

async function vendaFechada(opcoes: { adiantamento?: boolean } = {}) {
  const { empresa, user, pos } = await createTenant()
  const produto = await createProduto(empresa)
  const lote = await createLote(produto, { quantidade_em_estoque: 50, preco_venda: 1000 })
  const caixa = await createCaixa(user, pos)

  const cliente = await Cliente.create({
    nome: 'Cliente de Teste',
    tipo: 'Pessoa Física',
    nif: '5000123456',
    empresa_id: empresa.id,
  } as any)

  const venda = await createVenda(caixa, { status: 'aberta' })
  venda.cliente_presencial_id = cliente.id
  await venda.save()

  await createVendaItem(venda, lote, { quantidade: 2, preco_unitario: 1000 })
  await pagarVenda(venda, 2000)

  await new VendasRepository().close({
    id: venda.id,
    user_id: user.id,
    company_alias: empresa.company_alias,
    ...(opcoes.adiantamento ? { condicao_pagamento: 'adiantamento' as const } : {}),
  })

  return { empresa, user, pos, lote, venda }
}

test.group('reembolso — tem de haver documento a rectificar', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('um reembolso total emite a nota de crédito pelo valor devolvido', async ({ assert }) => {
    const { empresa, user, venda } = await vendaFechada()
    const factura = await Factura.query().where('venda_id', venda.id).firstOrFail()

    await new ProdutosReembolsoRepository().reembolsar_total({
      venda_id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    } as any)

    const nota = await Factura.query()
      .where('documento_origem_id', factura.id)
      .where('tipo', 'Nota de Crédito')
      .firstOrFail()

    assert.equal(Number(nota.total), 2000)
  })

  /**
   * O caso que a primeira versão deixava passar em silêncio.
   *
   * Devolvia `null` e o reembolso seguia — o dinheiro saía e a operação continuava
   * declarada pelo valor cheio. É o sistema a produzir, ele próprio, a divergência
   * que este trabalho veio corrigir.
   */
  test('uma venda por titular NÃO pode ser reembolsada', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 50 })
    const caixa = await createCaixa(user, pos)

    // Criada pela fixture, portanto sem passar pelo fecho — e é o fecho que emite.
    const venda = await createVenda(caixa, { status: 'fechada', total: 1000 })
    await createVendaItem(venda, lote, { quantidade: 1, preco_unitario: 1000 })

    await assert.rejects(
      () =>
        new ProdutosReembolsoRepository().reembolsar_total({
          venda_id: venda.id,
          user_id: user.id,
          company_alias: empresa.company_alias,
        } as any),
      VendaSemDocumentoException
    )

    // E não devolveu stock nenhum: a recusa é ANTES da transacção do reembolso.
    const loteDepois = await Lote.findOrFail(lote.id)
    assert.equal(Number(loteDepois.quantidade_em_estoque), 50)
  })
})

test.group('reembolso — o stock só volta se chegou a sair', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('numa venda entregue, o stock volta', async ({ assert }) => {
    const { empresa, user, lote, venda } = await vendaFechada()

    assert.equal(Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque), 48)

    await new ProdutosReembolsoRepository().reembolsar_total({
      venda_id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    } as any)

    assert.equal(Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque), 50)
  })

  /**
   * O buraco que o adiantamento abriu, e que este teste fecha.
   *
   * Num adiantamento por entregar o produto **continua no armazém** — o fecho não
   * deu baixa nenhuma. Devolvê-lo ao stock no reembolso criaria mercadoria do
   * nada: o sistema passaria a contar 52 unidades onde há 50, e o inventário
   * deixaria de bater à primeira contagem física.
   */
  test('num adiantamento POR ENTREGAR, o stock não volta — porque não saiu', async ({
    assert,
  }) => {
    const { empresa, user, lote, venda } = await vendaFechada({ adiantamento: true })

    assert.equal(
      Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque),
      50,
      'o fecho de um adiantamento não dá baixa'
    )

    /*
     * O adiantamento não titula a venda — titula o recebimento. Para o reembolso
     * poder emitir a nota de crédito é preciso o documento da operação, e é a
     * entrega que o emite. Aqui a venda é entregue primeiro para o teste poder
     * isolar a pergunta do stock... não: o que se quer testar é o contrário.
     * Emite-se o documento da venda à mão, sem entregar, para o stock continuar
     * dentro e o reembolso ter o que rectificar.
     */
    await new FacturaRepository().emitir({
      company_alias: empresa.company_alias,
      tipo: 'Factura-Recibo',
      venda_id: venda.id,
    })

    await new ProdutosReembolsoRepository().reembolsar_total({
      venda_id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    } as any)

    assert.equal(
      Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque),
      50,
      'devolver stock que nunca saiu criaria mercadoria do nada'
    )
  })

  test('num adiantamento JÁ ENTREGUE, o stock volta', async ({ assert }) => {
    const { empresa, user, lote, venda } = await vendaFechada({ adiantamento: true })

    await new VendasRepository().entregar({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    assert.equal(Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque), 48)

    await new ProdutosReembolsoRepository().reembolsar_total({
      venda_id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    } as any)

    assert.equal(Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque), 50)
  })

  test('um reembolso parcial de um adiantamento por entregar também não mexe no stock', async ({
    assert,
  }) => {
    const { empresa, user, lote, venda } = await vendaFechada({ adiantamento: true })

    await new FacturaRepository().emitir({
      company_alias: empresa.company_alias,
      tipo: 'Factura-Recibo',
      venda_id: venda.id,
    })

    const itens = await new VendaItensRepository().paginate(1, 10, {
      venda_id: venda.id,
      company_alias: empresa.company_alias,
    })

    await new ProdutosReembolsoRepository().reembolsar_parcial({
      venda_item_id: itens[0].id,
      quantidade: 1,
      user_id: user.id,
      company_alias: empresa.company_alias,
    } as any)

    assert.equal(Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque), 50)
  })
})

test.group('autofacturação — o adquirente emite em nome do fornecedor', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * O tipo sempre existiu e era inútil.
   *
   * Não havia forma de indicar a contraparte: `emitir()` só a derivava de uma venda
   * ou de um documento de origem, e a autofacturação não tem nem uma nem outro. O
   * documento saía sem dizer em nome de quem foi emitido — que é a única coisa que
   * o distingue de uma factura-recibo.
   */
  test('emite com o fornecedor identificado', async ({ assert }) => {
    const { empresa } = await createTenant()

    const documento = await new FacturaRepository().emitir({
      company_alias: empresa.company_alias,
      tipo: 'Autofacturação',
      total: 45000,
      cliente_nome: 'Cooperativa Agrícola do Kwanza-Sul',
      cliente_nif: '5417098765',
      observacoes: 'Compra a produtor sem facturação própria.',
    })

    assert.equal(documento.tipo, 'Autofacturação')
    assert.equal(documento.designacao, 'Factura-Recibo de Autofacturação')
    assert.equal(documento.codigo_documento, 'AF')
    assert.equal(documento.cliente_nome, 'Cooperativa Agrícola do Kwanza-Sul')
    assert.equal(documento.cliente_nif, '5417098765')
    assert.equal(Number(documento.total), 45000)
    assert.isNotNull(documento.referencia)
  })

  /**
   * A contraparte do PEDIDO nunca se sobrepõe à que se deriva.
   *
   * É o que impede uma nota de crédito de creditar a dívida de outra pessoa e um
   * recibo de dar quitação a quem não pagou. Os campos existem para os documentos
   * que nascem sozinhos — não para reescrever os outros.
   *
   * Este teste tem dentes: com a precedência invertida (`data ?? origem`, que foi
   * a primeira versão), a nota sai em nome de «Outra Pessoa Qualquer».
   */
  test('num documento com origem, o adquirente da origem ganha ao do pedido', async ({
    assert,
  }) => {
    const { empresa, venda } = await vendaFechada()
    const factura = await Factura.query().where('venda_id', venda.id).firstOrFail()

    assert.equal(factura.cliente_nome, 'Cliente de Teste')

    const nota = await new FacturaRepository().emitir({
      company_alias: empresa.company_alias,
      tipo: 'Nota de Crédito',
      documento_origem_id: factura.id,
      total: 100,
      cliente_nome: 'Outra Pessoa Qualquer',
      cliente_nif: '9999999999',
    })

    assert.equal(
      nota.cliente_nome,
      'Cliente de Teste',
      'uma nota que rectifica outro documento tem de nomear o mesmo adquirente'
    )
    assert.equal(nota.cliente_nif, '5000123456')
  })

  /** E numa venda, o cliente da venda ganha a tudo. */
  test('numa venda, o cliente da venda ganha ao do pedido', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 20, preco_venda: 500 })
    const caixa = await createCaixa(user, pos)

    const cliente = await Cliente.create({
      nome: 'Quem Comprou Mesmo',
      tipo: 'Pessoa Física',
      nif: '5000000001',
      empresa_id: empresa.id,
    } as any)

    const venda = await createVenda(caixa, { status: 'fechada', total: 500 })
    venda.cliente_presencial_id = cliente.id
    await venda.save()
    await createVendaItem(venda, lote, { quantidade: 1, preco_unitario: 500 })

    const documento = await new FacturaRepository().emitir({
      company_alias: empresa.company_alias,
      tipo: 'Factura-Recibo',
      venda_id: venda.id,
      cliente_nome: 'Quem Não Comprou Nada',
      cliente_nif: '9999999999',
    })

    assert.equal(documento.cliente_nome, 'Quem Comprou Mesmo')
    assert.equal(documento.cliente_nif, '5000000001')
  })
})
