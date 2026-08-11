import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import VendasRepository from '#repositories/vendas_repository'
import VendaItensRepository from '#repositories/venda_itens_repository'
import VendaIsAlreadyOpenOrCloseException from '#exceptions/venda_is_already_open_or_close_exception'
import UserHasAnOpenVendaException from '#exceptions/user_has_an_open_venda_exception'
import {
  createTenant,
  createProduto,
  createLote,
  createCaixa,
  createVenda,
} from '../helpers/fixtures.js'

/**
 * 'proforma' é um estado real de vendas.status (migration
 * 1784662475781_alter_vendas_add_proforma_status) — uma cotação com histórico
 * persistido, mas que nunca passa por close() (sem pagamento/consumo de stock) e nunca
 * interage com a regra de "uma venda aberta por utilizador" (só considera 'aberta').
 */
test.group('vendas_repository — estado proforma', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('create({ proforma: true }) cria a venda já com status proforma', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    await createCaixa(user, pos)

    const vendasRepo = new VendasRepository()
    const venda = await vendasRepo.create({
      company_alias: empresa.company_alias,
      user_id: user.id,
      venda_tipo: 'presencial',
      proforma: true,
    })

    assert.equal(venda.status, 'proforma')
    assert.equal(venda.total, 0)
  })

  test('create({ proforma: true, total }) grava o total já — nunca passa por close() para o calcular', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    await createCaixa(user, pos)

    const vendasRepo = new VendasRepository()
    const venda = await vendasRepo.create({
      company_alias: empresa.company_alias,
      user_id: user.id,
      venda_tipo: 'presencial',
      proforma: true,
      total: 1234.5,
    })

    assert.equal(venda.total, 1234.5)
  })

  test('create() sem proforma continua a ignorar total (só close() o define)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    await createCaixa(user, pos)

    const vendasRepo = new VendasRepository()
    const venda = await vendasRepo.create({
      company_alias: empresa.company_alias,
      user_id: user.id,
      venda_tipo: 'presencial',
      total: 1234.5,
    })

    assert.equal(venda.total, 0)
  })

  test('gerar uma proforma não é bloqueado por já existir uma venda aberta', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'aberta' })

    const vendasRepo = new VendasRepository()
    const proforma = await vendasRepo.create({
      company_alias: empresa.company_alias,
      user_id: user.id,
      venda_tipo: 'presencial',
      proforma: true,
    })

    assert.equal(proforma.status, 'proforma')
  })

  test('uma proforma existente não bloqueia a criação de uma venda real', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'proforma' })

    const vendasRepo = new VendasRepository()
    const real = await vendasRepo.create({
      company_alias: empresa.company_alias,
      user_id: user.id,
      venda_tipo: 'presencial',
    })

    assert.equal(real.status, 'aberta')
  })

  test('uma venda aberta a mais continua a bloquear (regressão da query mais explícita)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'proforma' })
    await createVenda(caixa, { status: 'aberta' })

    const vendasRepo = new VendasRepository()
    await assert.rejects(
      () =>
        vendasRepo.create({
          company_alias: empresa.company_alias,
          user_id: user.id,
          venda_tipo: 'presencial',
        }),
      UserHasAnOpenVendaException
    )
  })

  test('permite adicionar itens a uma proforma', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    await createCaixa(user, pos)
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { preco_venda: 500, quantidade_em_estoque: 10 })

    const vendasRepo = new VendasRepository()
    const proforma = await vendasRepo.create({
      company_alias: empresa.company_alias,
      user_id: user.id,
      venda_tipo: 'presencial',
      proforma: true,
    })

    const itensRepo = new VendaItensRepository()
    const item = await itensRepo.create({
      venda_id: proforma.id,
      lote_produto_id: lote.id,
      quantidade: 2,
      quantidade_reembolsada: 0,
      company_alias: empresa.company_alias,
    })

    assert.isNotNull(item)
    assert.equal((item as any).quantidade, 2)

    // Uma proforma nunca consome stock real — só close() decrementa, e proformas nunca
    // passam por close().
    await lote.refresh()
    assert.equal(lote.quantidade_em_estoque, 10)
  })

  test('close() rejeita uma proforma — nunca fecha como venda normal', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'proforma' })
    // Uma venda sem itens é apagada por close() antes de chegar ao check de status
    // (comportamento pré-existente, igual para 'aberta') — precisa de pelo menos um
    // item para exercitar mesmo o guard que bloqueia o fecho de uma proforma.
    const produto = await createProduto(empresa)
    const lote = await createLote(produto)
    const itensRepo = new VendaItensRepository()
    await itensRepo.create({
      venda_id: venda.id,
      lote_produto_id: lote.id,
      quantidade: 1,
      quantidade_reembolsada: 0,
      company_alias: empresa.company_alias,
    })

    const vendasRepo = new VendasRepository()
    await assert.rejects(
      () => vendasRepo.close({ id: venda.id, company_alias: empresa.company_alias }),
      VendaIsAlreadyOpenOrCloseException
    )
  })

  test('cancel() permite anular uma proforma', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'proforma' })

    const vendasRepo = new VendasRepository()
    const cancelada = await vendasRepo.cancel({ id: venda.id, company_alias: empresa.company_alias })

    assert.equal(cancelada.status, 'cancelada')
  })

  test('paginate({ status: "proforma" }) devolve o histórico de proformas', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'proforma', total: 0 })
    await createVenda(caixa, { status: 'aberta' })

    const vendasRepo = new VendasRepository()
    const pagina = await vendasRepo.paginate(1, 20, {
      company_alias: empresa.company_alias,
      status: 'proforma',
    })

    assert.equal(pagina.total, 1)
    assert.equal(pagina.all()[0].status, 'proforma')
    // vendedor_nome/pos_nome vêm de colunas de join ("as X"), guardadas em $extras —
    // só aparecem no JSON servido pela API porque serializeExtras foi definido; aqui
    // confirma-se via .toJSON(), o mesmo caminho que uma resposta HTTP realmente usa.
    assert.equal((pagina.all()[0].toJSON() as any).vendedor_nome, user.username)
  })
})
