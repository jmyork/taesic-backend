import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import ProdutoMedia from '#models/faturacao/produto_media'
import ProdutoMediaRepository from '#repositories/produto_media_repository'
import { createTenant, createProduto } from '../helpers/fixtures.js'

/**
 * Limite de 30 imagens (não-apagadas) por produto. A verificação corre ANTES de qualquer
 * upload para o disco/R2 — por isso estes testes usam objectos `media` só com o
 * comprimento certo (nunca chegam a ser lidos como ficheiros reais quando o limite já
 * bloqueia o pedido).
 */
test.group('produto_media_repository.create() — limite de imagens', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function seedImagens(produtoId: string, quantidade: number) {
    await ProdutoMedia.createMany(
      Array.from({ length: quantidade }, (_, i) => ({
        produto_id: produtoId,
        media: `https://example.com/imagem-${i}.jpg`,
      }))
    )
  }

  test('lança ProdutoMediaLimiteAtingidoException quando o produto já tem 30 imagens', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa)
    await seedImagens(produto.id, 30)

    const repo = new ProdutoMediaRepository()

    await assert.rejects(
      () =>
        repo.create({
          produto_id: produto.id,
          media: [{}] as any,
          company_alias: empresa.company_alias,
        }),
      /limite de 30 imagens por produto já foi atingido/
    )
  })

  test('lança ProdutoMediaLimiteExcedidoException quando o lote enviado ultrapassa o limite, indicando quantas ainda cabem', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa)
    await seedImagens(produto.id, 28)

    const repo = new ProdutoMediaRepository()

    // 28 já registadas + 5 no pedido = 33, excede em 3; só sobram 2 vagas (30 - 28).
    await assert.rejects(
      () =>
        repo.create({
          produto_id: produto.id,
          media: [{}, {}, {}, {}, {}] as any,
          company_alias: empresa.company_alias,
        }),
      /Restam apenas 2 imagens disponíveis para inserir/
    )
  })

  test('não lança excepção quando o total fica abaixo do limite', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa)
    await seedImagens(produto.id, 29)

    const repo = new ProdutoMediaRepository()

    // `media: []` só serve para exercitar a lógica de contagem/comparação sem tocar em
    // ficheiros reais (o repositório não valida `minLength` — isso é feito pelo validator
    // na camada HTTP); um pedido real nunca chega aqui com um array vazio.
    const registos = await repo.create({
      produto_id: produto.id,
      media: [] as any,
      company_alias: empresa.company_alias,
    })
    assert.lengthOf(registos, 0)
  })
})
