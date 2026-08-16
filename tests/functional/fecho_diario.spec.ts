import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import FechoDiarioRepository from '#repositories/fecho_diario_repository'
import Caixa from '#models/caixa'
import Vendas from '#models/faturacao/vendas'
import VendasRepository from '#repositories/vendas_repository'
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
 * Fecho automático das caixas ao fim do dia (`node ace caixa:fechar-diario`, via cron).
 *
 * Uma caixa aberta de um dia para o outro faz as vendas do dia seguinte somarem-se ao
 * mesmo total, e uma venda que ficou aberta impede mesmo o fecho manual
 * (`CaixaHasOpenVendaException`) — a caixa ficava presa indefinidamente.
 */
test.group('fecho diário das caixas', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('fecha a caixa aberta e anula a venda que ficou por fechar', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10, preco_venda: 1000 })

    const caixa = await createCaixa(user, pos, { status: 'Aberto', valor_inicial: 500 })

    // Uma venda fechada (conta para o total) e outra que ficou aberta (tem de ser anulada).
    const fechada = await createVenda(caixa)
    await createVendaItem(fechada, lote, { quantidade: 2, preco_unitario: 1000 })
    await pagarVenda(fechada, 2000)
    await new VendasRepository().close({
      id: fechada.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    const porFechar = await createVenda(caixa)
    await createVendaItem(porFechar, lote, { quantidade: 1, preco_unitario: 1000 })

    const resumo = await new FechoDiarioRepository().fecharCaixasAbertas(DateTime.now())

    assert.isAtLeast(resumo.caixasFechadas, 1)
    assert.isAtLeast(resumo.vendasAnuladas, 1)

    const caixaDepois = await Caixa.findOrFail(caixa.id)
    assert.equal(caixaDepois.status.toLowerCase(), 'fechado')
    assert.isNotNull(caixaDepois.data_fecho, 'a caixa fechada tem de registar a hora de fecho')

    const vendaDepois = await Vendas.findOrFail(porFechar.id)
    assert.equal(vendaDepois.status, 'cancelada')

    const continuaFechada = await Vendas.findOrFail(fechada.id)
    assert.equal(continuaFechada.status, 'fechada', 'uma venda já fechada não é tocada')

    // Só a venda efectivada conta para o total: 2 x 1000.
    assert.equal(Number(caixaDepois.total_vendas), 2000)
    assert.equal(Number(caixaDepois.total_caixa), 2500, 'valor inicial + vendas')
  })

  test('não mexe em caixas já fechadas nem em proformas', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 5, preco_venda: 300 })

    const caixaFechada = await createCaixa(user, pos, { status: 'Fechado' })
    const proforma = await createVenda(caixaFechada, { status: 'proforma' })
    await createVendaItem(proforma, lote, { quantidade: 1, preco_unitario: 300 })

    const antes = await Caixa.findOrFail(caixaFechada.id)
    const actualizadoAntes = antes.updatedAt?.toMillis()

    await new FechoDiarioRepository().fecharCaixasAbertas(DateTime.now())

    const depois = await Caixa.findOrFail(caixaFechada.id)
    assert.equal(depois.status.toLowerCase(), 'fechado')
    assert.equal(depois.updatedAt?.toMillis(), actualizadoAntes, 'não foi tocada')

    const proformaDepois = await Vendas.findOrFail(proforma.id)
    assert.equal(proformaDepois.status, 'proforma', 'uma cotação não é uma venda por fechar')
  })
})
