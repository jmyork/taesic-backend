import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import ProdutosRepository from '#repositories/produtos_repository'
import MarcaRepository from '#repositories/marca_repository'
import ProdutoFabricantesRepository from '#repositories/produto_fabricantes_repository'
import ProdutoFormatosRepository from '#repositories/produto_formatos_repository'
import ProdutoFornecedoresRepository from '#repositories/produto_fornecedores_repository'
import ProdutoCategoriasRepository from '#repositories/produto_categorias_repository'
import EstoqueRepository from '#repositories/estoque_repository'
import CaixaRepository from '#repositories/caixa_repository'
import VendasRepository from '#repositories/vendas_repository'
import VendaItensRepository from '#repositories/venda_itens_repository'
import Lote from '#models/faturacao/lote'
import Vendas from '#models/faturacao/vendas'
import { createTenant } from '../helpers/fixtures.js'

/**
 * Fluxo completo de registo de um produto e dos seus "adicionais" (marca, fabricante,
 * formato, fornecedor, categoria, descrições, contra-indicações, recomendações) —
 * `produtosRepository.registrarProdutoAndDetalhes()` existia e funcionava ao nível do
 * repository/service, mas a acção do controller e a rota estavam comentadas (nunca
 * tinham sido ligadas a um pedido real); a chamada directa a `produtos.create(data.
 * produto, ...)` também nunca resolvia `company_alias` -> `empresa_id`, o que teria
 * criado o produto sem tenant. Ambos corrigidos nesta sessão.
 *
 * Continua depois para estoque (entrada) -> venda -> item -> CANCELAMENTO — ao
 * contrário do fluxo em `fluxo_ponta_a_ponta.spec.ts` (que fecha e reembolsa), este
 * cobre especificamente `vendas_repository.cancel()`: uma venda cancelada ainda aberta
 * nunca decrementou stock, por isso cancelar não deve alterá-lo.
 */
test.group('fluxo completo: adicionais -> produto+detalhes -> estoque -> venda -> cancelamento', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * `produtos_controller.registrar_produto_and_detalhes` injeta `user_id: auth.user?.id`
   * em `payload.produto` antes de chamar o service — mas `Produtos` não tem coluna
   * `user_id`, e `registrarProdutoAndDetalhes()` só retira `company_alias` do payload
   * antes do `produtos.create()`, deixando `user_id` passar e rebentar com
   * "Cannot define 'user_id' on 'produtos' model". Nenhum teste anterior passava
   * `user_id` (só o controller o injecta), por isso isto só apareceu ao testar via
   * HTTP real.
   */
  test('regista produto com detalhes mesmo quando o payload inclui user_id (injectado pelo controller)', async ({
    assert,
  }) => {
    const { empresa, user } = await createTenant()
    const companyAlias = empresa.company_alias

    const marca = await new MarcaRepository().create({ nome: 'Marca UserId', company_alias: companyAlias } as any)

    const produtosRepo = new ProdutosRepository()
    const produto = await produtosRepo.registrarProdutoAndDetalhes({
      produto: {
        nome: 'Produto Com UserId',
        descricao: 'Descrição do produto',
        is_service: false,
        marca_id: marca.id,
        company_alias: companyAlias,
        user_id: user.id,
      } as any,
      detalhes: {},
    })

    assert.equal(produto.empresa_id, empresa.id)
  })

  test('regista produto com todos os adicionais, dá entrada em stock, e cancela a venda sem alterar o stock', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const companyAlias = empresa.company_alias

    // 1. Registar os "adicionais" do produto
    const marca = await new MarcaRepository().create({ nome: 'Marca Teste', company_alias: companyAlias } as any)
    const fabricante = await new ProdutoFabricantesRepository().create({
      nome: 'Fabricante Teste',
      endereco: 'Rua Teste, 1',
      telefone: '900000001',
      email: 'fabricante@example.com',
      company_alias: companyAlias,
    } as any)
    const formato = await new ProdutoFormatosRepository().create({
      nome: 'Comprimido',
      company_alias: companyAlias,
    } as any)
    const fornecedor = await new ProdutoFornecedoresRepository().create({
      nome: 'Fornecedor Teste',
      endereco: 'Rua Teste, 2',
      telefone: '900000002',
      email: 'fornecedor@example.com',
      company_alias: companyAlias,
    } as any)
    const categoria = await new ProdutoCategoriasRepository().create({
      nome: 'Higiene',
      descricao: 'Produtos de higiene',
      company_alias: companyAlias,
    } as any)

    // 2. Registar o produto + detalhes numa única chamada transaccional
    const produtosRepo = new ProdutosRepository()
    const produto = await produtosRepo.registrarProdutoAndDetalhes({
      produto: {
        nome: 'Produto Teste Completo',
        descricao: 'Descrição do produto',
        is_service: false,
        marca_id: marca.id,
        fabricante_id: fabricante.id,
        formato_id: formato.id,
        fornecedor_id: fornecedor.id,
        company_alias: companyAlias,
      } as any,
      detalhes: {
        descricoes: [{ propriedade: 'Peso', descricao_detalhada: '500g' } as any],
        categorias: [{ produto_categoria_id: categoria.id }],
        contraindicacoes: [{ contraindicacao: 'Não usar em crianças' }],
        recomendacoes: [{ recomendacao: 'Manter refrigerado' }],
      },
    })

    assert.equal(produto.empresa_id, empresa.id)
    assert.equal(produto.marca_id, marca.id)
    assert.equal(produto.fabricante_id, fabricante.id)
    assert.equal(produto.formato_id, formato.id)
    assert.equal(produto.fornecedor_id, fornecedor.id)

    const descricoes = await produto.related('descricoes').query()
    assert.lengthOf(descricoes, 1)
    assert.equal(descricoes[0].propriedade, 'Peso')

    const categoriasDoProeduto = await produto.related('categorias').query()
    assert.lengthOf(categoriasDoProeduto, 1)
    assert.equal(categoriasDoProeduto[0].id, categoria.id)

    const contraindicacoes = await produto.related('contraindicacoes').query()
    assert.lengthOf(contraindicacoes, 1)

    const recomendacoes = await produto.related('recomendacoes').query()
    assert.lengthOf(recomendacoes, 1)

    // 3. Dar entrada em stock (cria o lote directamente — a entrada inicial de stock de
    // um produto novo não passa por estoqueRepository.create(), que exige um lote
    // já existente para bloquear com FOR UPDATE)
    const lote = await Lote.create({
      produto_id: produto.id,
      data_validade: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) as any,
      data_fabrico: new Date() as any,
      quantidade_em_estoque: 0,
      preco_venda: 2000,
      preco_compra: 1000,
    } as any)

    const estoqueRepo = new EstoqueRepository()
    await estoqueRepo.create({
      pos_id: pos.id,
      registrado_por: user.id,
      motivo: 'compra',
      tipo_movimentacao: 'entrada',
      quantidade: 20,
      lote_produto_id: lote.id,
      company_alias: companyAlias,
    } as any)

    const loteComStock = await Lote.findOrFail(lote.id)
    assert.equal(Number(loteComStock.quantidade_em_estoque), 20)

    // 4. Abrir caixa, abrir venda, adicionar item
    const caixaRepo = new CaixaRepository()
    const caixa = await caixaRepo.open({
      pos_id: pos.id,
      user_id: user.id,
      company_alias: companyAlias,
      valor_inicial: 0,
    })

    const vendasRepo = new VendasRepository()
    const venda = await vendasRepo.create({
      company_alias: companyAlias,
      user_id: user.id,
      venda_tipo: 'presencial',
    } as any)
    assert.equal(venda.caixa_id, caixa.id)

    const itensRepo = new VendaItensRepository()
    await itensRepo.create({
      venda_id: venda.id,
      lote_produto_id: lote.id,
      quantidade: 3,
      company_alias: companyAlias,
    } as any)

    // 5. Cancelar a venda (ainda aberta — nunca chegou a fechar)
    const vendaCancelada = await vendasRepo.cancel({
      id: venda.id,
      user_id: user.id,
      company_alias: companyAlias,
    })
    assert.equal(vendaCancelada.status, 'cancelada')

    // O stock NUNCA é tocado por cancel() — só close() decrementa. Cancelar uma venda
    // aberta (mesmo com itens já adicionados) tem de deixar o stock intacto.
    const loteAposCancelamento = await Lote.findOrFail(lote.id)
    assert.equal(Number(loteAposCancelamento.quantidade_em_estoque), 20)

    const vendaFinal = await Vendas.findOrFail(venda.id)
    assert.equal(vendaFinal.status, 'cancelada')
  })
})
