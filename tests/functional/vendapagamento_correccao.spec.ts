import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import CaixaRepository from '#repositories/caixa_repository'
import VendasRepository from '#repositories/vendas_repository'
import VendaItensRepository from '#repositories/venda_itens_repository'
import VendapagamentoRepository from '#repositories/vendapagamento_repository'
import Vendapagamento from '#models/vendapagamento'
import UserPos from '#models/userpos'
import PagamentoVendaNaoAbertaException from '#exceptions/pagamento_venda_nao_aberta_exception'
import {
  createTenant,
  createUser,
  createProduto,
  createLote,
  createMetodoPagamento,
} from '../helpers/fixtures.js'
import { userHasPermission } from '../../app/helpers/Utils.js'

/**
 * Corrigir um pagamento mal registado — só enquanto a venda está aberta.
 *
 * Contexto (ver 7.12): dar `domain_vendapagamento.update/destroy` ao Vendedor resolvia o
 * beco em que ficava ao escrever um valor a MAIS (o fecho rejeita por excesso e ele não
 * tinha como desfazer), mas sem mais nenhuma regra abria outro pior: mexer num pagamento
 * de uma venda JÁ FECHADA, cujo valor a caixa já contabilizou (`recalcularTotais`). A
 * regra "só com a venda aberta" vive no repositório, não nas permissões — vale para
 * qualquer papel, incluindo Admin, e para quem chame o repositório directamente.
 */
test.group('vendapagamento — corrigir só com a venda aberta', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** Venda aberta, com um item de 2 x 500 = 1000 a pagar. */
  async function vendaAbertaComItem() {
    const { empresa, pos } = await createTenant()
    const companyAlias = empresa.company_alias
    const vendedor = await createUser(empresa, ['Vendedor'])
    await UserPos.create({ user_id: vendedor.id, pos_id: pos.id })

    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10, preco_venda: 500 })

    await new CaixaRepository().open({
      pos_id: pos.id,
      user_id: vendedor.id,
      company_alias: companyAlias,
      valor_inicial: 0,
    })

    const vendasRepo = new VendasRepository()
    const venda = await vendasRepo.create({
      company_alias: companyAlias,
      user_id: vendedor.id,
      venda_tipo: 'presencial',
    } as any)

    await new VendaItensRepository().create({
      venda_id: venda.id,
      lote_produto_id: lote.id,
      quantidade: 2,
      company_alias: companyAlias,
    } as any)

    return { empresa, companyAlias, vendedor, venda, vendasRepo, total: 1000 }
  }

  test('o vendedor desfaz um pagamento a mais e fecha a venda', async ({ assert }) => {
    const { empresa, companyAlias, vendedor, venda, vendasRepo, total } = await vendaAbertaComItem()
    const metodo = await createMetodoPagamento(empresa)
    const repo = new VendapagamentoRepository()

    // Engana-se: regista 1100 em vez de 1000.
    const pagamento = await repo.create({
      venda_id: venda.id,
      metodo_pagamento_id: metodo.id,
      valor: 1100,
    } as any)

    await assert.rejects(
      () => vendasRepo.close({ id: venda.id, user_id: vendedor.id, company_alias: companyAlias }),
      /excesso|a mais|1100|1000/i
    )

    // Desfaz e regista o valor certo — sem precisar de ninguém.
    await repo.softDelete(pagamento.id, companyAlias)
    await repo.create({
      venda_id: venda.id,
      metodo_pagamento_id: metodo.id,
      valor: total,
    } as any)

    const fechada = await vendasRepo.close({
      id: venda.id,
      user_id: vendedor.id,
      company_alias: companyAlias,
    })
    assert.equal(fechada.status, 'fechada')
    assert.equal(Number(fechada.total), total)
  })

  test('corrigir o valor (update) com a venda aberta também serve', async ({ assert }) => {
    const { empresa, companyAlias, vendedor, venda, vendasRepo, total } = await vendaAbertaComItem()
    const metodo = await createMetodoPagamento(empresa)
    const repo = new VendapagamentoRepository()

    const pagamento = await repo.create({
      venda_id: venda.id,
      metodo_pagamento_id: metodo.id,
      valor: 900,
    } as any)

    await repo.update(pagamento.id, { valor: total } as any, companyAlias)

    const fechada = await vendasRepo.close({
      id: venda.id,
      user_id: vendedor.id,
      company_alias: companyAlias,
    })
    assert.equal(fechada.status, 'fechada')
  })

  test('com a venda fechada, nem apagar nem editar o pagamento', async ({ assert }) => {
    const { empresa, companyAlias, vendedor, venda, vendasRepo, total } = await vendaAbertaComItem()
    const metodo = await createMetodoPagamento(empresa)
    const repo = new VendapagamentoRepository()

    const pagamento = await repo.create({
      venda_id: venda.id,
      metodo_pagamento_id: metodo.id,
      valor: total,
    } as any)
    await vendasRepo.close({ id: venda.id, user_id: vendedor.id, company_alias: companyAlias })

    // O dinheiro já entrou nos totais da caixa — o histórico deixa de ser editável.
    await assert.rejects(
      () => repo.softDelete(pagamento.id, companyAlias),
      PagamentoVendaNaoAbertaException
    )
    await assert.rejects(
      () => repo.update(pagamento.id, { valor: 1 } as any, companyAlias),
      PagamentoVendaNaoAbertaException
    )

    const intacto = await Vendapagamento.findOrFail(pagamento.id)
    assert.equal(Number(intacto.valor), total)
    assert.isNull(intacto.deletedAt)
  })

  test('não é possível repor um pagamento apagado depois de a venda fechar', async ({ assert }) => {
    const { empresa, companyAlias, vendedor, venda, vendasRepo, total } = await vendaAbertaComItem()
    const metodo = await createMetodoPagamento(empresa)
    const repo = new VendapagamentoRepository()

    // Um pagamento apagado ainda com a venda aberta (não conta para o fecho)...
    const descartado = await repo.create({
      venda_id: venda.id,
      metodo_pagamento_id: metodo.id,
      valor: 50,
    } as any)
    await repo.softDelete(descartado.id, companyAlias)

    await repo.create({
      venda_id: venda.id,
      metodo_pagamento_id: metodo.id,
      valor: total,
    } as any)
    await vendasRepo.close({ id: venda.id, user_id: vendedor.id, company_alias: companyAlias })

    // ... não pode ser "ressuscitado" com a venda já fechada: o soft delete é um toggle, e
    // repô-lo somaria 50 a uma venda cujo total a caixa já contabilizou.
    await assert.rejects(
      () => repo.softDelete(descartado.id, companyAlias),
      PagamentoVendaNaoAbertaException
    )
    assert.isNotNull((await Vendapagamento.findOrFail(descartado.id)).deletedAt)
  })

  test('mover um pagamento para uma venda fechada é rejeitado', async ({ assert }) => {
    const primeira = await vendaAbertaComItem()
    const metodo = await createMetodoPagamento(primeira.empresa)
    const repo = new VendapagamentoRepository()

    // Fecha a primeira venda...
    await repo.create({
      venda_id: primeira.venda.id,
      metodo_pagamento_id: metodo.id,
      valor: primeira.total,
    } as any)
    await primeira.vendasRepo.close({
      id: primeira.venda.id,
      user_id: primeira.vendedor.id,
      company_alias: primeira.companyAlias,
    })

    // ... e tenta reatribuir-lhe o pagamento de uma venda nova (ainda aberta).
    const segunda = await vendaAbertaComItem()
    const metodo2 = await createMetodoPagamento(segunda.empresa)
    const pagamentoAberto = await repo.create({
      venda_id: segunda.venda.id,
      metodo_pagamento_id: metodo2.id,
      valor: 100,
    } as any)

    await assert.rejects(
      () =>
        repo.update(
          pagamentoAberto.id,
          { venda_id: primeira.venda.id } as any,
          segunda.companyAlias
        ),
      PagamentoVendaNaoAbertaException
    )
  })

  test('a correcção não atravessa o isolamento por tenant', async ({ assert }) => {
    const { empresa, companyAlias, venda } = await vendaAbertaComItem()
    const outro = await createTenant()
    const metodo = await createMetodoPagamento(empresa)
    const repo = new VendapagamentoRepository()

    const pagamento = await repo.create({
      venda_id: venda.id,
      metodo_pagamento_id: metodo.id,
      valor: 100,
    } as any)

    // Outra empresa não mexe neste pagamento só por saber o UUID.
    await assert.rejects(() => repo.softDelete(pagamento.id, outro.empresa.company_alias))
    await assert.rejects(() => repo.update(pagamento.id, { valor: 1 } as any, outro.empresa.company_alias))

    const intacto = await Vendapagamento.findOrFail(pagamento.id)
    assert.equal(Number(intacto.valor), 100)
    assert.isNull(intacto.deletedAt)
    assert.isString(companyAlias)
  })

  test('Vendedor, Gerente e Supervisor podem corrigir um pagamento', async ({ assert }) => {
    const { empresa } = await createTenant()

    for (const papel of ['Vendedor', 'Gerente', 'Supervisor']) {
      const utilizador = await createUser(empresa, [papel])
      for (const rota of ['domain_vendapagamento.update', 'domain_vendapagamento.destroy']) {
        assert.isTrue(
          await userHasPermission(utilizador, rota),
          `${papel} devia poder corrigir um pagamento (${rota})`
        )
      }
    }
  })
})

