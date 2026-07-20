import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import emitter from '@adonisjs/core/services/emitter'
import EstoqueRepository from '#repositories/estoque_repository'
import LoteRepository from '#repositories/lote_repository'
import VendasRepository from '#repositories/vendas_repository'
import ProdutosReembolsoRepository from '#repositories/produtos_reembolso_repository'
import VerificationTokenHashRepository from '#repositories/verification_token_hash_repository'
import VerificationTokenHashService from '#services/verification_token_hash_service'
import Empresa from '#models/empresa'
import EstoqueCritico from '#events/estoque_critico'
import LoteValidadeProxima from '#events/lote_validade_proxima'
import VendaCanceladaAltoValor from '#events/venda_cancelada_alto_valor'
import EstoqueRevertido from '#events/estoque_revertido'
import EmpresaActivated from '#events/empresa_activated'
import { createTenant, createProduto, createLote, createCaixa, createVenda, createVendaItem } from '../helpers/fixtures.js'

/**
 * Cobre os eventos de domínio ligados nesta sessão (estoque crítico, produto perto da
 * validade, venda cancelada de alto valor, reversão de estoque, empresa activada) — antes
 * disto, `start/events.ts` nem sequer estava incluído nos `preloads` do adonisrc.ts, e o
 * único listener existente (`empresa:activated`) tinha o `emitter.on(...)` comentado.
 */
test.group('eventos de alerta operacional', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('estoque_repository.create() emite EstoqueCritico quando uma saída deixa o lote no limiar', async () => {
    const { empresa, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10 })

    const events = emitter.fake([EstoqueCritico])

    await new EstoqueRepository().create({
      pos_id: pos.id,
      motivo: 'venda',
      tipo_movimentacao: 'saida',
      quantidade: 7, // 10 - 7 = 3, <= limiar por omissão (5)
      lote_produto_id: lote.id,
      company_alias: empresa.company_alias,
    } as any)

    events.assertEmitted(EstoqueCritico, (e) => e.data.quantidadeAtual === 3 && e.data.loteId === lote.id)
    emitter.restore()
  })

  test('estoque_repository.create() NÃO emite EstoqueCritico quando o stock fica acima do limiar', async () => {
    const { empresa, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 100 })

    const events = emitter.fake([EstoqueCritico])

    await new EstoqueRepository().create({
      pos_id: pos.id,
      motivo: 'venda',
      tipo_movimentacao: 'saida',
      quantidade: 5, // 100 - 5 = 95, bem acima do limiar
      lote_produto_id: lote.id,
      company_alias: empresa.company_alias,
    } as any)

    events.assertNotEmitted(EstoqueCritico)
    emitter.restore()
  })

  test('lote_repository.avisarLotesProximosValidade() emite LoteValidadeProxima para lotes a expirar', async ({
    assert,
  }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa)
    const loteAExpirar = await createLote(produto, { quantidade_em_estoque: 5 })
    loteAExpirar.data_validade = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) as any
    await loteAExpirar.save()

    const loteLongeDaValidade = await createLote(produto, { quantidade_em_estoque: 5 })
    loteLongeDaValidade.data_validade = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) as any
    await loteLongeDaValidade.save()

    const events = emitter.fake([LoteValidadeProxima])

    const total = await new LoteRepository().avisarLotesProximosValidade(30)

    assert.equal(total, 1)
    events.assertEmittedCount(LoteValidadeProxima, 1)
    events.assertEmitted(LoteValidadeProxima, (e) => e.data.loteId === loteAExpirar.id)
    emitter.restore()
  })

  test('vendas_repository.cancel() emite VendaCanceladaAltoValor quando o total dos itens excede o limiar', async () => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 100, preco_venda: 60000 })
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 1, preco_unitario: 60000 }) // > limiar por omissão (50000)

    const events = emitter.fake([VendaCanceladaAltoValor])

    await new VendasRepository().cancel({ id: venda.id, company_alias: empresa.company_alias } as any)

    events.assertEmitted(VendaCanceladaAltoValor, (e) => e.data.vendaId === venda.id && e.data.total === 60000)
    emitter.restore()
  })

  test('vendas_repository.cancel() NÃO emite VendaCanceladaAltoValor para vendas de baixo valor', async () => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 100, preco_venda: 500 })
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 1, preco_unitario: 500 })

    const events = emitter.fake([VendaCanceladaAltoValor])

    await new VendasRepository().cancel({ id: venda.id, company_alias: empresa.company_alias } as any)

    events.assertNotEmitted(VendaCanceladaAltoValor)
    emitter.restore()
  })

  test('produtos_reembolso_repository.reembolsar_total() emite EstoqueRevertido', async () => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10 })
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada' })
    await createVendaItem(venda, lote, { quantidade: 2, preco_unitario: 500 })

    const events = emitter.fake([EstoqueRevertido])

    await new ProdutosReembolsoRepository().reembolsar_total({
      venda_id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    } as any)

    events.assertEmitted(EstoqueRevertido, (e) => e.data.loteId === lote.id && e.data.quantidade === 2)
    emitter.restore()
  })

  test('verification_token_hash_repository.verify() emite EmpresaActivated ao activar a conta', async ({
    assert,
  }) => {
    const { empresa, user } = await createTenant()
    empresa.verified = false
    await empresa.save()

    const tokenService = new VerificationTokenHashService()
    const { token } = await tokenService.createToken({
      user_id: user.id,
      empresa_id: empresa.id,
      purpose: 'account_activation',
    })

    const events = emitter.fake([EmpresaActivated])

    await new VerificationTokenHashRepository().verify(token)

    events.assertEmitted(EmpresaActivated, (e) => e.data.empresaId === empresa.id && e.data.userId === user.id)
    emitter.restore()

    const empresaAtualizada = await Empresa.findOrFail(empresa.id)
    assert.isTrue(Boolean(empresaAtualizada.verified))
  })
})
