import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { MultipartFileFactory } from '@adonisjs/bodyparser/factories'
import { createproduto_mediaValidator } from '#validators/produto_media_validator'
import { createTenant, createProduto } from '../helpers/fixtures.js'

const EXTNAMES = ['jpg', 'jpeg', 'png', 'gif', 'mkv', 'mp4', 'webm']

function fakeImage() {
  return new MultipartFileFactory()
    .merge({ extname: 'jpg', size: 1000, type: 'image', subtype: 'jpeg' })
    .create({ size: '25mb', extnames: EXTNAMES })
}

/**
 * Regressão: `media` exigia sempre um array (`vine.array(vine.file(...))`), rejeitando um
 * upload de uma única imagem quando o cliente não envolve o campo em `[]` — apesar do
 * repository (`produto_media_repository.create()`) já normalizar com
 * `Array.isArray(data.media) ? data.media : [data.media]`, a validação bloqueava antes de
 * lá chegar. Corrigido com `vine.unionOfTypes([vine.file(...), vine.array(vine.file(...))])`.
 */
test.group('produto_media_validator - media aceita um único ficheiro ou um array', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('aceita um único ficheiro, sem precisar de estar dentro de um array', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa)

    const payload = await createproduto_mediaValidator.validate({
      produto_id: produto.id,
      media: fakeImage(),
      params: { company_alias: empresa.company_alias },
    })

    assert.isFalse(Array.isArray(payload.media))
  })

  test('continua a aceitar um array de ficheiros', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa)

    const payload = await createproduto_mediaValidator.validate({
      produto_id: produto.id,
      media: [fakeImage(), fakeImage()],
      params: { company_alias: empresa.company_alias },
    })

    assert.isTrue(Array.isArray(payload.media))
    assert.lengthOf(payload.media as any[], 2)
  })

  test('rejeita quando media não é nem um ficheiro nem um array', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa)

    await assert.rejects(() =>
      createproduto_mediaValidator.validate({
        produto_id: produto.id,
        media: 'isto-nao-e-um-ficheiro',
        params: { company_alias: empresa.company_alias },
      })
    )
  })

  test('rejeita um array vazio (minLength(1) continua a aplicar-se ao ramo array)', async ({ assert }) => {
    const { empresa } = await createTenant()
    const produto = await createProduto(empresa)

    await assert.rejects(() =>
      createproduto_mediaValidator.validate({
        produto_id: produto.id,
        media: [],
        params: { company_alias: empresa.company_alias },
      })
    )
  })
})
