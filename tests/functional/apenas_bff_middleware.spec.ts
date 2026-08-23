import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import ApenasBffMiddleware from '#middleware/apenas_bff_middleware'

/**
 * `ApenasBffMiddleware` — só os frontends indicados podem falar com esta API.
 *
 * Nunca teve testes. Ganhou-os agora porque passou a conhecer **dois** segredos: a
 * app dos inquilinos e o backoffice da plataforma são clientes distintos, e um
 * frontend novo é exactamente o tipo de mudança que parte um portão em silêncio —
 * ou porque passa a recusar quem devia entrar, ou porque passa a aceitar quem não
 * devia.
 *
 * O que NÃO se testa aqui, por não ser testável de forma honesta: a comparação em
 * tempo constante. Medir tempos num teste dá falsos positivos e falsos negativos
 * conforme a máquina; o que garante isso é `timingSafeEqual` e a ausência de
 * `find`/`some` no ciclo (ver o comentário no middleware).
 */
test.group('apenas_bff_middleware', (group) => {
  const original = {
    app: process.env.BFF_SHARED_SECRET,
    backoffice: process.env.BFF_SHARED_SECRET_BACKOFFICE,
  }

  // `env.get()` lê de `process.env` — repor no fim para não contaminar os outros
  // testes da suite, que correm no mesmo processo.
  group.each.teardown(() => {
    if (original.app === undefined) delete process.env.BFF_SHARED_SECRET
    else process.env.BFF_SHARED_SECRET = original.app

    if (original.backoffice === undefined) delete process.env.BFF_SHARED_SECRET_BACKOFFICE
    else process.env.BFF_SHARED_SECRET_BACKOFFICE = original.backoffice
  })

  async function correr(cabecalho?: string) {
    const ctx = await testUtils.createHttpContext()
    if (cabecalho !== undefined) ctx.request.request.headers['x-bff-secret'] = cabecalho

    let passou = false
    await new ApenasBffMiddleware().handle(ctx, async () => {
      passou = true
    })

    return { passou, status: ctx.response.getStatus() }
  }

  test('sem nenhum segredo configurado, deixa passar tudo', async ({ assert }) => {
    // Falha aberto de propósito: um deploy sem o segredo dos dois lados continua a
    // funcionar, em vez de deixar a plataforma inteira em 403. Activar é deliberado.
    delete process.env.BFF_SHARED_SECRET
    delete process.env.BFF_SHARED_SECRET_BACKOFFICE

    const { passou } = await correr()
    assert.isTrue(passou)
  })

  test('aceita o segredo da app dos inquilinos', async ({ assert }) => {
    process.env.BFF_SHARED_SECRET = 'segredo-da-app'
    delete process.env.BFF_SHARED_SECRET_BACKOFFICE

    const { passou } = await correr('segredo-da-app')
    assert.isTrue(passou)
  })

  test('aceita o segredo do backoffice', async ({ assert }) => {
    process.env.BFF_SHARED_SECRET = 'segredo-da-app'
    process.env.BFF_SHARED_SECRET_BACKOFFICE = 'segredo-do-backoffice'

    const { passou } = await correr('segredo-do-backoffice')
    assert.isTrue(passou, 'o segundo frontend tem de conseguir entrar')
  })

  test('o segredo da app continua a valer depois de existir um segundo', async ({ assert }) => {
    // A regressão óbvia: acrescentar o backoffice não pode deixar a app de fora.
    process.env.BFF_SHARED_SECRET = 'segredo-da-app'
    process.env.BFF_SHARED_SECRET_BACKOFFICE = 'segredo-do-backoffice'

    const { passou } = await correr('segredo-da-app')
    assert.isTrue(passou)
  })

  test('recusa um segredo que não é de nenhum dos dois', async ({ assert }) => {
    process.env.BFF_SHARED_SECRET = 'segredo-da-app'
    process.env.BFF_SHARED_SECRET_BACKOFFICE = 'segredo-do-backoffice'

    const { passou, status } = await correr('segredo-inventado')
    assert.isFalse(passou)
    assert.equal(status, 403)
  })

  test('recusa um pedido sem o cabeçalho', async ({ assert }) => {
    process.env.BFF_SHARED_SECRET = 'segredo-da-app'

    const { passou, status } = await correr()
    assert.isFalse(passou)
    assert.equal(status, 403)
  })

  test('só o backoffice configurado não deixa entrar o segredo da app', async ({ assert }) => {
    // Um segredo desligado deixa mesmo de valer — é o que torna a rotação possível.
    delete process.env.BFF_SHARED_SECRET
    process.env.BFF_SHARED_SECRET_BACKOFFICE = 'segredo-do-backoffice'

    const { passou, status } = await correr('segredo-da-app')
    assert.isFalse(passou)
    assert.equal(status, 403)
  })
})
