import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createvendapagamentoValidator } from '#validators/vendapagamento_validator'
import MetodoPagamento from '#models/metodopagamento'
import { createTenant, createPos, createCaixa, createVenda } from '../helpers/fixtures.js'

/**
 * `valor: vine.number().decimal(30,)` exigia 30 casas decimais — impossível para qualquer
 * valor monetário real (ex.: 3000 ou 3000.50) — o que tornava `POST vendapagamento`
 * inutilizável em produção (só passava com um número absurdo como "3000.000...0" com 30
 * zeros). Nunca detectado antes porque não havia nenhum teste a exercitar este validator.
 */
test.group('vendapagamento_validator', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('aceita um valor monetário normal (2 casas decimais)', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const pos = await createPos(empresa)
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { total: 3000 })
    const metodo = await MetodoPagamento.create({ nome: 'Numerario' } as any)

    const payload = await createvendapagamentoValidator.validate({
      venda_id: venda.id,
      metodo_pagamento_id: metodo.id,
      valor: 3000.5,
    })

    assert.equal(payload.valor, 3000.5)
  })
})
