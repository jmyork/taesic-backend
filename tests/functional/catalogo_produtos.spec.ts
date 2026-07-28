import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import CatalogoPublicoRepository from '#repositories/catalogo_publico_repository'
import ProdutosRepository from '#repositories/produtos_repository'
import Marca from '#models/faturacao/marca'
import ProdutoFabricantes from '#models/faturacao/produto_fabricantes'
import ProdutoFormatos from '#models/faturacao/produto_formatos'
import ProdutoFornecedores from '#models/faturacao/produto_fornecedores'
import ProdutoDescricao from '#models/faturacao/produto_descricao'
import ProdutoContraindicacoes from '#models/faturacao/produto_contraindicacoes'
import ProdutoRecomendacoes from '#models/faturacao/produto_recomendacoes'
import ProdutoMedia from '#models/faturacao/produto_media'
import ProdutoCategorias from '#models/faturacao/produto_categorias'
import CategoriasProdutos from '#models/faturacao/categorias_produtos'
import Estoque from '#models/faturacao/estoque'
import { createTenant, createProduto, createLote, createUser } from '../helpers/fixtures.js'
import { userHasPermission } from '../../app/helpers/Utils.js'

/**
 * Catálogo de produtos em stock (público, cross-tenant, e de domínio) — pesquisável por
 * `q` (nome/descrição/descrições detalhadas) e filtrável por marca, formato, fabricante,
 * fornecedor, categoria, is_service, disponivel, pos (via movimentação de estoque) e
 * intervalo de preço de compra/venda. Devolve todas as características do produto
 * (descrições, contraindicações, recomendações, categorias, marca, fabricante, formato,
 * fornecedor, medias, lotes) via `.preload()`, só com os campos de negócio — sem
 * enabled/created_at/updated_at/deleted_at (evita trazer dados de auditoria desnecessários).
 */
test.group('catálogo de produtos — características, pesquisa e filtros', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('devolve todas as características do produto, sem campos de auditoria nos preloads', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa, { nome: `Produto Completo ${Date.now()}` })
    const lote = await createLote(produto, { preco_venda: 1000, preco_compra: 400, quantidade_em_estoque: 50 })

    const marcaRow = await Marca.create({ nome: 'Marca X', descricao: 'Descrição da marca', empresa_id: empresa.id })
    const fabricanteRow = await ProdutoFabricantes.create({
      nome: 'Fabricante X',
      email: 'fab@example.com',
      telefone: '900000000',
      endereco: 'Rua X',
      empresa_id: empresa.id,
    })
    const formatoRow = await ProdutoFormatos.create({ nome: 'Formato X', descricao: 'Descrição formato', empresa_id: empresa.id })
    const fornecedorRow = await ProdutoFornecedores.create({
      nome: 'Fornecedor X',
      email: 'forn@example.com',
      telefone: '911111111',
      endereco: 'Rua Y',
      empresa_id: empresa.id,
    })

    produto.marca_id = marcaRow.id
    produto.fabricante_id = fabricanteRow.id
    produto.formato_id = formatoRow.id
    produto.fornecedor_id = fornecedorRow.id
    await produto.save()

    await ProdutoDescricao.create({ produto_id: produto.id, propriedade: 'Peso', descricao_detalhada: '500g' })
    await ProdutoContraindicacoes.create({ produto_id: produto.id, contraindicacao: 'Não usar se grávida' })
    await ProdutoRecomendacoes.create({ produto_id: produto.id, recomendacao: 'Usar de manhã' })
    await ProdutoMedia.create({ produto_id: produto.id, media: 'https://example.com/img.jpg' } as any)

    const categoria = await ProdutoCategorias.create({ nome: 'Categoria X', descricao: 'desc', empresa_id: empresa.id })
    await CategoriasProdutos.create({ produto_id: produto.id, produto_categoria_id: categoria.id })

    const repo = new CatalogoPublicoRepository()
    const resultado = await repo.paginateProdutos(1, 20, { q: produto.nome })
    const linha = resultado.all()[0].toJSON() as any

    assert.equal(linha.id, produto.id)
    assert.equal(linha.marca.nome, 'Marca X')
    assert.equal(linha.marca.descricao, 'Descrição da marca')
    assert.equal(linha.fabricante.nome, 'Fabricante X')
    assert.equal(linha.formato.nome, 'Formato X')
    assert.equal(linha.fornecedor.nome, 'Fornecedor X')
    assert.equal(linha.categorias[0].nome, 'Categoria X')
    assert.equal(linha.descricoes[0].propriedade, 'Peso')
    assert.equal(linha.contraindicacoes[0].contraindicacao, 'Não usar se grávida')
    assert.equal(linha.recomendacoes[0].recomendacao, 'Usar de manhã')
    assert.equal(linha.medias[0].media, 'https://example.com/img.jpg')
    assert.equal(linha.lotes[0].id, lote.id)
    assert.equal(Number(linha.quantidade_em_estoque), 50)
    assert.equal(Number(linha.preco_venda_min), 1000)
    assert.equal(Number(linha.preco_compra_min), 400)

    // sem dados de auditoria nos preloads — só os campos de negócio pedidos.
    assert.notProperty(linha.marca, 'createdAt')
    assert.notProperty(linha.marca, 'enabled')
    assert.notProperty(linha.fornecedor, 'createdAt')
    assert.notProperty(linha.fornecedor, 'deletedAt')
    assert.notProperty(linha.descricoes[0], 'createdAt')
    assert.notProperty(linha.categorias[0], 'createdAt')
  })

  test('filtra por marca_id', async ({ assert }) => {
    const { empresa } = await createTenant()
    const marcaA = await Marca.create({ nome: 'A', descricao: 'x', empresa_id: empresa.id })
    const marcaB = await Marca.create({ nome: 'B', descricao: 'x', empresa_id: empresa.id })

    const produtoA = await createProduto(empresa, { nome: `Prod A ${Date.now()}` })
    produtoA.marca_id = marcaA.id
    await produtoA.save()
    await createLote(produtoA)

    const produtoB = await createProduto(empresa, { nome: `Prod B ${Date.now()}` })
    produtoB.marca_id = marcaB.id
    await produtoB.save()
    await createLote(produtoB)

    const repo = new CatalogoPublicoRepository()
    const resultado = await repo.paginateProdutos(1, 20, { marca_id: marcaA.id })
    const ids = resultado.all().map((r) => r.id)

    assert.include(ids, produtoA.id)
    assert.notInclude(ids, produtoB.id)
  })

  test('filtra por is_service e disponivel', async ({ assert }) => {
    const { empresa } = await createTenant()
    const servicoIndisponivel = await createProduto(empresa, {
      nome: `Servico ${Date.now()}`,
      is_service: true,
      disponivel: false,
    })
    await createLote(servicoIndisponivel, { quantidade_em_estoque: 0 })

    const repo = new CatalogoPublicoRepository()
    const soServicos = await repo.paginateProdutos(1, 20, { is_service: true })
    assert.include(soServicos.all().map((r) => r.id), servicoIndisponivel.id)

    const disponiveis = await repo.paginateProdutos(1, 20, { is_service: true, disponivel: true })
    assert.notInclude(disponiveis.all().map((r) => r.id), servicoIndisponivel.id)
  })

  test('filtra por intervalo de preco_compra', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produtoBarato = await createProduto(empresa, { nome: `Barato ${Date.now()}` })
    await createLote(produtoBarato, { preco_compra: 100 })

    const produtoCaro = await createProduto(empresa, { nome: `Caro ${Date.now()}` })
    await createLote(produtoCaro, { preco_compra: 900 })

    const repo = new CatalogoPublicoRepository()
    const resultado = await repo.paginateProdutos(1, 20, { preco_compra_start: 500, preco_compra_end: 1000 })
    const ids = resultado.all().map((r) => r.id)

    assert.include(ids, produtoCaro.id)
    assert.notInclude(ids, produtoBarato.id)
  })

  test('filtra por pos_id (produtos com movimentação de estoque nesse pos) e devolve os postos no resultado', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()

    const produtoComMovimento = await createProduto(empresa, { nome: `ComMovimento ${Date.now()}` })
    const loteComMovimento = await createLote(produtoComMovimento)
    await Estoque.create({
      lote_produto_id: loteComMovimento.id,
      produto_id: produtoComMovimento.id,
      quantidade: 5,
      tipo_movimentacao: 'entrada',
      motivo: 'compra',
      registrado_por: user.id,
      pos_id: pos.id,
    } as any)

    const produtoSemMovimento = await createProduto(empresa, { nome: `SemMovimento ${Date.now()}` })
    await createLote(produtoSemMovimento)

    const repo = new CatalogoPublicoRepository()
    const resultado = await repo.paginateProdutos(1, 20, { pos_id: pos.id })
    const ids = resultado.all().map((r) => r.id)

    assert.include(ids, produtoComMovimento.id)
    assert.notInclude(ids, produtoSemMovimento.id)

    const linha = resultado.all().find((r) => r.id === produtoComMovimento.id)!.toJSON() as any
    assert.lengthOf(linha.postos, 1)
    assert.equal(linha.postos[0].id, pos.id)
    assert.equal(linha.postos[0].nome, pos.nome)
  })

  test('filtra por pos_nome (pesquisa parcial pelo nome do POS)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()

    const produtoComMovimento = await createProduto(empresa, { nome: `ComMovimentoNome ${Date.now()}` })
    const loteComMovimento = await createLote(produtoComMovimento)
    await Estoque.create({
      lote_produto_id: loteComMovimento.id,
      produto_id: produtoComMovimento.id,
      quantidade: 5,
      tipo_movimentacao: 'entrada',
      motivo: 'compra',
      registrado_por: user.id,
      pos_id: pos.id,
    } as any)

    const produtoSemMovimento = await createProduto(empresa, { nome: `SemMovimentoNome ${Date.now()}` })
    await createLote(produtoSemMovimento)

    const repo = new CatalogoPublicoRepository()
    const resultado = await repo.paginateProdutos(1, 20, { pos_nome: pos.nome.slice(0, 5) })
    const ids = resultado.all().map((r) => r.id)

    assert.include(ids, produtoComMovimento.id)
    assert.notInclude(ids, produtoSemMovimento.id)
  })
})

test.group('catálogo de produtos — isolamento por tenant (endpoint de domínio)', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('produtos_repository.catalogo() só devolve produtos da própria empresa', async ({ assert }) => {
    const empresaA = (await createTenant()).empresa
    const empresaB = (await createTenant()).empresa

    const produtoA = await createProduto(empresaA, { nome: `TenantA ${Date.now()}` })
    await createLote(produtoA)
    const produtoB = await createProduto(empresaB, { nome: `TenantB ${Date.now()}` })
    await createLote(produtoB)

    const repo = new ProdutosRepository()
    const resultado = await repo.catalogo(1, 20, {}, empresaA.company_alias)
    const ids = resultado.all().map((r: any) => r.id)

    assert.include(ids, produtoA.id)
    assert.notInclude(ids, produtoB.id)
  })
})

test.group('catálogo de produtos — permissão domain_produtos.catalogo', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('Admin, Gerente, Supervisor, Vendedor e Estoquista têm acesso ao catálogo', async ({ assert }) => {
    const { empresa, user: admin } = await createTenant()

    const gerente = await createUser(empresa, ['Gerente'])
    const supervisor = await createUser(empresa, ['Supervisor'])
    const vendedor = await createUser(empresa, ['Vendedor'])
    const estoquista = await createUser(empresa, ['Estoquista'])

    for (const user of [admin, gerente, supervisor, vendedor, estoquista]) {
      assert.isTrue(await userHasPermission(user, 'domain_produtos.catalogo'))
    }
  })

  test('AdminUserManager (gestão de utilizadores, não de produtos) não tem acesso ao catálogo', async ({ assert }) => {
    const { empresa } = await createTenant()

    const adminUserManager = await createUser(empresa, ['AdminUserManager'])
    assert.isFalse(await userHasPermission(adminUserManager, 'domain_produtos.catalogo'))
  })
})
