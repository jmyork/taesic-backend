import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import HttpExceptionHandler from '#exceptions/handler'
import CupomInvalidoException from '#exceptions/cupom_invalido_exception'
import UnAuthorizedCaixaException from '#exceptions/un_authorized_caixa_exception'
import CaixaIsAlreadyOpenException from '#exceptions/caixa_is_already_open_exception'

/**
 * O handler global antes só tratava especificamente `CaixaAlreadyClosedException` — as
 * outras ~18 excepções de domínio (e o `E_ROW_NOT_FOUND` do Lucid) dependiam de cada
 * controller repetir `if (error.code === 'X') {...}` à mão em cada acção. Como todas
 * partilham a mesma base `Exception` do `@adonisjs/core` (`static status`/`code`/
 * `message`), um único `instanceof Exception` no handler cobre-as todas.
 *
 * `CaixaIsAlreadyOpenException` e `UnAuthorizedCaixaException` tinham `static status = 500`
 * mas um `handle()` próprio que forçava 400/401 — nunca reparado porque os controllers
 * intercetavam sempre a excepção primeiro, tornando esse `handle()` morto na prática.
 * Corrigido o `static status` em vez de manter o `handle()` a compensar um valor errado.
 */
test.group('HttpExceptionHandler', () => {
  test('excepção de domínio (sem handle próprio) é traduzida para {data,message,status,code}', async ({
    assert,
  }) => {
    const ctx = await testUtils.createHttpContext()
    const handler = new HttpExceptionHandler()

    await handler.handle(new CupomInvalidoException(), ctx)

    assert.equal(ctx.response.getStatus(), 422)
    assert.deepEqual(ctx.response.getBody(), {
      data: null,
      message: 'Cupão inválido, expirado ou não aplicável a esta empresa.',
      status: 422,
      code: 'CUPOM_INVALIDO',
    })
  })

  test('UnAuthorizedCaixaException devolve 401 (o static status errado era compensado por um handle() próprio)', async ({
    assert,
  }) => {
    const ctx = await testUtils.createHttpContext()
    const handler = new HttpExceptionHandler()

    await handler.handle(new UnAuthorizedCaixaException(), ctx)

    assert.equal(ctx.response.getStatus(), 401)
  })

  test('CaixaIsAlreadyOpenException devolve 400 (idem)', async ({ assert }) => {
    const ctx = await testUtils.createHttpContext()
    const handler = new HttpExceptionHandler()

    await handler.handle(new CaixaIsAlreadyOpenException(), ctx)

    assert.equal(ctx.response.getStatus(), 400)
  })

  test('erro de validação do VineJS (error.messages) devolve 400 com "Dados inválidos"', async ({ assert }) => {
    const ctx = await testUtils.createHttpContext()
    const handler = new HttpExceptionHandler()

    await handler.handle({ messages: [{ field: 'nome', message: 'obrigatório' }] }, ctx)

    assert.equal(ctx.response.getStatus(), 400)
    assert.deepEqual(ctx.response.getBody(), {
      data: null,
      message: 'Dados inválidos',
      status: 400,
      errors: [{ field: 'nome', message: 'obrigatório' }],
    })
  })
})
