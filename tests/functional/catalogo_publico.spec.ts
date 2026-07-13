import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import CatalogoPublicoRepository from '#repositories/catalogo_publico_repository'
import PromotorRepository from '#repositories/promotor_repository'
import LeadRepository from '#repositories/lead_repository'
import { createEmpresa, createProduto, createLote } from '../helpers/fixtures.js'

test.group('catalogo_publico_repository', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('lista produtos de VÁRIAS empresas diferentes — é o único sítio sem isolamento por tenant', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()

    const produtoA = await createProduto(empresaA, { nome: `Produto A ${Date.now()}` })
    await createLote(produtoA, { preco_venda: 1500 })

    const produtoB = await createProduto(empresaB, { nome: `Produto B ${Date.now()}` })
    await createLote(produtoB, { preco_venda: 3000 })

    const repo = new CatalogoPublicoRepository()
    const resultado = await repo.paginateProdutos(1, 50)
    const json = resultado.toJSON()

    const nomesEmpresas = json.data.map((row: any) => row.empresa_nome)
    assert.include(nomesEmpresas, empresaA.nome)
    assert.include(nomesEmpresas, empresaB.nome)
  })

  test('mostra o preço mais baixo disponível quando o produto tem vários lotes', async ({ assert }) => {
    const empresa = await createEmpresa()
    const produto = await createProduto(empresa, { nome: `Multi-lote ${Date.now()}` })
    await createLote(produto, { preco_venda: 2000 })
    await createLote(produto, { preco_venda: 1200 })

    const repo = new CatalogoPublicoRepository()
    const resultado = await repo.paginateProdutos(1, 50, produto.nome)
    const json = resultado.toJSON()

    const linha = json.data.find((row: any) => row.produto_id === produto.id)
    assert.isDefined(linha)
    assert.equal(Number(linha.preco_a_partir_de), 1200)
  })

  test('a pesquisa (q) filtra por nome do produto', async ({ assert }) => {
    const empresa = await createEmpresa()
    const nonce = Date.now()
    const produto = await createProduto(empresa, { nome: `ProdutoUnico${nonce}` })
    await createLote(produto, { preco_venda: 500 })

    const repo = new CatalogoPublicoRepository()
    const resultado = await repo.paginateProdutos(1, 50, `ProdutoUnico${nonce}`)
    const json = resultado.toJSON()

    assert.equal(json.data.length, 1)
    assert.equal(json.data[0].produto_id, produto.id)
  })
})

test.group('lead_repository + promotor perfil público', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('registar um lead associa corretamente ao promotor e à sua empresa fixa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'Perfil Público',
      email: `perfil-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })

    const leadRepo = new LeadRepository()
    const lead = await leadRepo.registar(promotor.id, promotor.empresa_id)

    assert.equal(lead.promotor_id, promotor.id)
    assert.equal(lead.empresa_id, empresa.id)
  })

  test('um promotor de plataforma gera leads sem empresa fixa (empresa_id null)', async ({ assert }) => {
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({ nome: 'Global Lead', email: `globallead-${Date.now()}@example.com` })

    const leadRepo = new LeadRepository()
    const lead = await leadRepo.registar(promotor.id, promotor.empresa_id)

    assert.isNull(lead.empresa_id)
  })

  test('findByCodigoPerfil encontra o promotor certo pelo slug público', async ({ assert }) => {
    const empresa = await createEmpresa()
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'Slug Test',
      email: `slug-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })

    const encontrado = await promotorRepo.findByCodigoPerfil(promotor.codigo_perfil)
    assert.equal(encontrado?.id, promotor.id)

    const naoEncontrado = await promotorRepo.findByCodigoPerfil('codigo-que-nao-existe')
    assert.isNull(naoEncontrado)
  })
})
