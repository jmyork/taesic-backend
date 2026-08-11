import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import ProdutosRepository from '#repositories/produtos_repository'
import Lote from '#models/faturacao/lote'
import { createTenant, createProduto, createLote } from '../helpers/fixtures.js'
import { userHasPermission } from '../../app/helpers/Utils.js'

/**
 * Alertas de produtos (estoque baixo/esgotado, validade próxima/expirada) —
 * `GET produtos/alertas`. Mesmos limiares usados pelos eventos de domínio já
 * existentes (`ESTOQUE_LIMIAR_CRITICO`, omissão 5; `LOTE_VALIDADE_ALERTA_DIAS`,
 * omissão 30), mas aqui consultados sob pedido em vez de reactivamente por email.
 */
test.group('produtos_repository.alertas()', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sinaliza estoque_baixo quando quantidade <= limiar crítico (omissão 5)', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa, { nome: `Baixo ${Date.now()}` })
    const lote = await createLote(produto, { quantidade_em_estoque: 3 })

    const repo = new ProdutosRepository()
    const resultado = await repo.alertas(empresa.company_alias)
    const encontrada = resultado.data.find((l: any) => l.lote_id === lote.id)

    assert.exists(encontrada)
    const linha = encontrada!
    assert.isTrue(linha.estoque_baixo)
    assert.isFalse(linha.esgotado)
  })

  test('sinaliza esgotado quando quantidade_em_estoque é 0', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa, { nome: `Esgotado ${Date.now()}` })
    const lote = await createLote(produto, { quantidade_em_estoque: 0 })

    const repo = new ProdutosRepository()
    const resultado = await repo.alertas(empresa.company_alias)
    const encontrada = resultado.data.find((l: any) => l.lote_id === lote.id)

    assert.exists(encontrada)
    assert.isTrue(encontrada!.esgotado)
  })

  test('não sinaliza estoque baixo para serviços (nunca têm stock físico)', async ({ assert }) => {
    const { empresa } = await createTenant()
    const servico = await createProduto(empresa, { nome: `Servico ${Date.now()}`, is_service: true })
    const lote = await createLote(servico, { quantidade_em_estoque: 0 })

    const repo = new ProdutosRepository()
    const resultado = await repo.alertas(empresa.company_alias)
    const linha = resultado.data.find((l: any) => l.lote_id === lote.id)

    assert.isUndefined(linha)
  })

  test('sinaliza validade_proxima quando data_validade cai dentro da janela (omissão 30 dias) e há stock', async ({
    assert,
  }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa, { nome: `Validade ${Date.now()}` })
    const lote = await Lote.create({
      produto_id: produto.id,
      data_validade: DateTime.now().plus({ days: 10 }).toJSDate() as any,
      data_fabrico: new Date() as any,
      quantidade_em_estoque: 100,
      preco_venda: 1000,
      preco_compra: 500,
    })

    const repo = new ProdutosRepository()
    const resultado = await repo.alertas(empresa.company_alias, { tipo: 'validade' })
    const encontrada = resultado.data.find((l: any) => l.lote_id === lote.id)

    assert.exists(encontrada)
    const linha = encontrada!
    assert.isTrue(linha.validade_proxima)
    assert.isFalse(linha.expirado)
    assert.approximately(linha.dias_restantes ?? -999, 10, 1)
  })

  test('sinaliza expirado quando data_validade já passou', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa, { nome: `Expirado ${Date.now()}` })
    const lote = await Lote.create({
      produto_id: produto.id,
      data_validade: DateTime.now().minus({ days: 5 }).toJSDate() as any,
      data_fabrico: new Date() as any,
      quantidade_em_estoque: 100,
      preco_venda: 1000,
      preco_compra: 500,
    })

    const repo = new ProdutosRepository()
    const resultado = await repo.alertas(empresa.company_alias)
    const encontrada = resultado.data.find((l: any) => l.lote_id === lote.id)

    assert.exists(encontrada)
    assert.isTrue(encontrada!.expirado)
  })

  test('não sinaliza validade_proxima quando o lote está esgotado (sem stock a expirar)', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa, { nome: `EsgotadoValidade ${Date.now()}` })
    const lote = await Lote.create({
      produto_id: produto.id,
      data_validade: DateTime.now().plus({ days: 5 }).toJSDate() as any,
      data_fabrico: new Date() as any,
      quantidade_em_estoque: 0,
      preco_venda: 1000,
      preco_compra: 500,
    })

    const repo = new ProdutosRepository()
    const resultado = await repo.alertas(empresa.company_alias, { tipo: 'validade' })
    const linha = resultado.data.find((l: any) => l.lote_id === lote.id)

    assert.isUndefined(linha)
  })

  test('filtro tipo=estoque exclui alertas só de validade', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produtoValidade = await createProduto(empresa, { nome: `SoValidade ${Date.now()}` })
    const loteValidade = await Lote.create({
      produto_id: produtoValidade.id,
      data_validade: DateTime.now().plus({ days: 5 }).toJSDate() as any,
      data_fabrico: new Date() as any,
      quantidade_em_estoque: 100,
      preco_venda: 1000,
      preco_compra: 500,
    })

    const repo = new ProdutosRepository()
    const resultado = await repo.alertas(empresa.company_alias, { tipo: 'estoque' })
    const linha = resultado.data.find((l: any) => l.lote_id === loteValidade.id)

    assert.isUndefined(linha)
  })

  test('isolamento por tenant: só devolve alertas da própria empresa', async ({ assert }) => {
    const empresaA = (await createTenant()).empresa
    const empresaB = (await createTenant()).empresa

    const produtoA = await createProduto(empresaA, { nome: `TenantA ${Date.now()}` })
    const loteA = await createLote(produtoA, { quantidade_em_estoque: 1 })
    const produtoB = await createProduto(empresaB, { nome: `TenantB ${Date.now()}` })
    await createLote(produtoB, { quantidade_em_estoque: 1 })

    const repo = new ProdutosRepository()
    const resultado = await repo.alertas(empresaA.company_alias)
    const ids = resultado.data.map((l: any) => l.lote_id)

    assert.include(ids, loteA.id)
    assert.lengthOf(resultado.data, 1)
  })

  test('produto com stock e validade normais não aparece em nenhum alerta', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa, { nome: `Normal ${Date.now()}` })
    const lote = await createLote(produto, { quantidade_em_estoque: 100 })

    const repo = new ProdutosRepository()
    const resultado = await repo.alertas(empresa.company_alias)
    const linha = resultado.data.find((l: any) => l.lote_id === lote.id)

    assert.isUndefined(linha)
  })

  test('pagina em memória respeitando page/limit', async ({ assert }) => {
    const { empresa } = await createTenant()
    for (let i = 0; i < 3; i++) {
      const produto = await createProduto(empresa, { nome: `Paginado${i} ${Date.now()}` })
      await createLote(produto, { quantidade_em_estoque: 1 })
    }

    const repo = new ProdutosRepository()
    const pagina1 = await repo.alertas(empresa.company_alias, { page: 1, limit: 2 })
    const pagina2 = await repo.alertas(empresa.company_alias, { page: 2, limit: 2 })

    assert.lengthOf(pagina1.data, 2)
    assert.lengthOf(pagina2.data, 1)
    assert.equal(pagina1.meta.total, 3)
    assert.equal(pagina1.meta.last_page, 2)
  })
})

test.group('produtos_alertas — permissão domain_produtos.alertas', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('Admin tem acesso a domain_produtos.alertas (mesmo critério de domain_produtos.catalogo)', async ({
    assert,
  }) => {
    const { user: admin } = await createTenant()
    assert.isTrue(await userHasPermission(admin, 'domain_produtos.alertas'))
  })
})
