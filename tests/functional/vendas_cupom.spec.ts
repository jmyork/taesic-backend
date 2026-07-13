import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import VendasRepository from '#repositories/vendas_repository'
import PromotorRepository from '#repositories/promotor_repository'
import CupomRepository from '#repositories/cupom_repository'
import {
  createTenant,
  createProduto,
  createLote,
  createCaixa,
  createVenda,
  createVendaItem,
} from '../helpers/fixtures.js'

test.group('vendas_repository — aplicação de cupão ao fechar', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('fechar com um cupão válido aplica o desconto e regista o cupão na venda', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { preco_venda: 1000 })
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 2, preco_unitario: 1000 }) // subtotal 2000

    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'Promotor Vendas',
      email: `pv-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupom = await cupomRepo.create({ promotor_id: promotor.id, desconto: 10, company_alias: empresa.company_alias })

    const vendasRepo = new VendasRepository()
    const fechada = await vendasRepo.close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      cupom_codigo: cupom.codigo,
    })

    assert.equal(fechada.status, 'fechada')
    assert.equal(fechada.cupom_id, cupom.id)
    assert.equal(Number(fechada.valor_desconto), 200) // 10% de 2000
    assert.equal(Number(fechada.total), 1800) // 2000 - 200
  })

  test('fechar sem cupão mantém o comportamento antigo (sem desconto)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { preco_venda: 500 })
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 3, preco_unitario: 500 })

    const vendasRepo = new VendasRepository()
    const fechada = await vendasRepo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    assert.isNull(fechada.cupom_id)
    assert.equal(Number(fechada.valor_desconto), 0)
    assert.equal(Number(fechada.total), 1500)
  })

  test('fechar com um código de cupão inexistente lança CUPOM_INVALIDO e não fecha a venda', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { preco_venda: 500 })
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 1, preco_unitario: 500 })

    const vendasRepo = new VendasRepository()
    await assert.rejects(
      () =>
        vendasRepo.close({
          id: venda.id,
          user_id: user.id,
          company_alias: empresa.company_alias,
          cupom_codigo: 'NAO-EXISTE-123',
        }),
      /CUPOM_INVALIDO|Cupão inválido/
    )

    const aindaAberta = await vendasRepo.findOrFail({ id: venda.id, company_alias: empresa.company_alias })
    assert.equal(aindaAberta.status, 'aberta')
  })

  test('fechar com um cupão de OUTRA empresa é rejeitado (isolamento de tenant)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const outraEmpresa = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { preco_venda: 500 })
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 1, preco_unitario: 500 })

    const promotorRepo = new PromotorRepository()
    const promotorDaOutra = await promotorRepo.create({
      nome: 'De outra empresa',
      email: `outra-${Date.now()}@example.com`,
      company_alias: outraEmpresa.empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupomDaOutra = await cupomRepo.create({
      promotor_id: promotorDaOutra.id,
      desconto: 50,
      company_alias: outraEmpresa.empresa.company_alias,
    })

    const vendasRepo = new VendasRepository()
    await assert.rejects(() =>
      vendasRepo.close({
        id: venda.id,
        user_id: user.id,
        company_alias: empresa.company_alias,
        cupom_codigo: cupomDaOutra.codigo,
      })
    )
  })

  test('fechar com um cupão expirado é rejeitado', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { preco_venda: 500 })
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 1, preco_unitario: 500 })

    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'Expirado',
      email: `exp-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupom = await cupomRepo.create({
      promotor_id: promotor.id,
      desconto: 10,
      validade: DateTime.now().minus({ days: 1 }).toJSDate(),
      company_alias: empresa.company_alias,
    })

    const vendasRepo = new VendasRepository()
    await assert.rejects(() =>
      vendasRepo.close({
        id: venda.id,
        user_id: user.id,
        company_alias: empresa.company_alias,
        cupom_codigo: cupom.codigo,
      })
    )
  })

  test('o desconto nunca ultrapassa o total da venda (clamp a 0)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { preco_venda: 100 })
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 1, preco_unitario: 100 })

    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'Desconto Total',
      email: `full-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupom = await cupomRepo.create({ promotor_id: promotor.id, desconto: 100, company_alias: empresa.company_alias })

    const vendasRepo = new VendasRepository()
    const fechada = await vendasRepo.close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      cupom_codigo: cupom.codigo,
    })

    assert.equal(Number(fechada.valor_desconto), 100)
    assert.equal(Number(fechada.total), 0)
  })
})
