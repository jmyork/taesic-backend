import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import CaixaRepository from '#repositories/caixa_repository'
import CaixaAlreadyOpenException from '#exceptions/caixa_already_open_exception'
import { createTenant, createCaixa } from '../helpers/fixtures.js'

/**
 * Regressão para bugs encontrados no fluxo de abertura/fecho/reabertura:
 *
 * 1. `open()` criava o registo sem `status` explícito — a coluna tem default 'Aberto'
 *    a nível de BD, mas o MySQL não devolve defaults calculados pelo INSERT, então o
 *    objecto devolvido ao chamador (ex.: resposta da API) ficava com `status: undefined`
 *    até à próxima leitura. Apanhado porque `fluxo_ponta_a_ponta.spec.ts` falhava logo
 *    no primeiro passo (abrir caixa).
 * 2. `reopen()` definia `data_fecho: DateTime.now()` ao reabrir — semanticamente
 *    invertido: uma caixa reaberta (status 'Aberto') deve ficar com `data_fecho: null`,
 *    tal como `destroy()` já fazia correctamente. Este caminho é alcançável a partir do
 *    endpoint público `POST caixas`: `open()` chama `reopen()` internamente quando o
 *    utilizador já tem uma caixa fechada no próprio dia.
 * 3. As duas queries em `open()` que verificam "já tenho caixa aberto"/"tenho caixa
 *    fechada hoje" fazem `join` com `user`/`empresa` sem `.select('caixa.*')` — como
 *    `empresa` também tem colunas `id`/`status`/`created_at` próprias, o `SELECT *`
 *    implícito devolvia essas colunas (não as de `caixa`) na hidratação do resultado.
 *    Isto tornava a verificação `caixaHoje?.status === 'Fechado'` sempre falsa (comparava
 *    o `status` booleano da empresa com a string 'Fechado'), pelo que a reabertura
 *    automática da caixa fechada no próprio dia nunca disparava — criava sempre uma
 *    caixa nova. Corrigido com `.select('caixa.*')` nas duas queries (mesmo padrão já
 *    usado em `paginate()`/`findOrFail()`).
 *
 * `destroy()` (o toggle real exposto pela API: `DELETE caixas/:id`) não tinha nenhum
 * teste antes desta sessão — coberto abaixo.
 */
test.group('caixa_repository - fluxo de abertura/fecho/reabertura', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('open() devolve o status já preenchido, sem precisar de recarregar da BD', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const repo = new CaixaRepository()

    const caixa = await repo.open({
      pos_id: pos.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      valor_inicial: 100,
    })

    assert.equal(caixa.status.toLocaleLowerCase(), 'aberto')
  })

  test('reopen() limpa data_fecho ao reabrir a caixa', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixaFechada = await createCaixa(user, pos, { status: 'fechado' })
    const repo = new CaixaRepository()

    const reaberta = await repo.reopen(caixaFechada.id, {
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    assert.equal(reaberta.status.toLocaleLowerCase(), 'aberto')
    assert.isNull(reaberta.data_fecho)
  })

  test('open() reabre automaticamente a caixa fechada hoje, já sem data_fecho', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixaFechadaHoje = await createCaixa(user, pos, { status: 'fechado' })
    const repo = new CaixaRepository()

    const resultado = await repo.open({
      pos_id: pos.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      valor_inicial: 50,
    })

    assert.equal(resultado.id, caixaFechadaHoje.id)
    assert.equal(resultado.status.toLocaleLowerCase(), 'aberto')
    assert.isNull(resultado.data_fecho)
  })

  test('destroy() fecha uma caixa aberta e define data_fecho', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixaAberta = await createCaixa(user, pos, { status: 'aberto' })
    const repo = new CaixaRepository()

    const fechada = await repo.destroy(caixaAberta.id, {
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    assert.equal(fechada.status.toLocaleLowerCase(), 'fechado')
    assert.isNotNull(fechada.data_fecho)
  })

  test('destroy() reabre uma caixa fechada e limpa data_fecho', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixaFechada = await createCaixa(user, pos, { status: 'fechado' })
    const repo = new CaixaRepository()

    const reaberta = await repo.destroy(caixaFechada.id, {
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    assert.equal(reaberta.status.toLocaleLowerCase(), 'aberto')
    assert.isNull(reaberta.data_fecho)
  })

  test('destroy() não deixa reabrir uma caixa se o utilizador já tem outra caixa aberta', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    await createCaixa(user, pos, { status: 'aberto' })
    const caixaFechada = await createCaixa(user, pos, { status: 'fechado' })
    const repo = new CaixaRepository()

    try {
      await repo.destroy(caixaFechada.id, { user_id: user.id, company_alias: empresa.company_alias })
      assert.fail('deveria ter lançado CaixaAlreadyOpenException')
    } catch (error) {
      assert.instanceOf(error, CaixaAlreadyOpenException)
    }
  })
})
