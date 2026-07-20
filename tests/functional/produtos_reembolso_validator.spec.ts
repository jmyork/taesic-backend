import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { ReembolsoTotalValidator } from '#validators/produtos_reembolso_validator'
import { createTenant, createPos, createCaixa, createVenda } from '../helpers/fixtures.js'

/**
 * `ReembolsoTotalValidator`'s `venda_id.exists()` fazia
 * `db.from('vendas').join('caixa', ...).join('pos', ...).join('empresa', ...).select(['venda_itens.*'])`
 * — seleciona `venda_itens.*` de uma query que nunca faz join a `venda_itens`, rebentando
 * sempre com "Unknown table 'venda_itens'" (ER_BAD_TABLE_ERROR). `POST reembolsar-total`
 * nunca funcionou por HTTP; só descoberto ao testar o fluxo real, já que nenhum teste
 * anterior exercitava este validator.
 */
test.group('produtos_reembolso_validator', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('ReembolsoTotalValidator valida um venda_id existente sem rebentar', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const pos = await createPos(empresa)
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 1000 })

    const payload = await ReembolsoTotalValidator.validate({
      venda_id: venda.id,
      motivo: 'Teste',
      params: { company_alias: empresa.company_alias },
    })

    assert.equal(payload.venda_id, venda.id)
  })
})
