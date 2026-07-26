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
 *
 * `venda_id`/`metodo_pagamento_id` passaram a exigir que ambos pertençam ao mesmo tenant
 * (`params.company_alias`) — antes só verificavam existência global, permitindo (em teoria)
 * referenciar uma venda ou método de pagamento de outra empresa.
 */
test.group('vendapagamento_validator', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('aceita um valor monetário normal (2 casas decimais)', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const pos = await createPos(empresa)
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { total: 3000 })
    const metodo = await MetodoPagamento.create({ nome: 'Numerario', empresa_id: empresa.id } as any)

    const payload = await createvendapagamentoValidator.validate({
      venda_id: venda.id,
      metodo_pagamento_id: metodo.id,
      valor: 3000.5,
      params: { company_alias: empresa.company_alias },
    })

    assert.equal(payload.valor, 3000.5)
  })

  test('rejeita um metodo_pagamento_id de outra empresa', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const outraEmpresa = (await createTenant()).empresa
    const pos = await createPos(empresa)
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { total: 3000 })
    const metodoDeOutraEmpresa = await MetodoPagamento.create({ nome: 'Numerario', empresa_id: outraEmpresa.id } as any)

    await assert.rejects(() =>
      createvendapagamentoValidator.validate({
        venda_id: venda.id,
        metodo_pagamento_id: metodoDeOutraEmpresa.id,
        valor: 3000,
        params: { company_alias: empresa.company_alias },
      })
    )
  })

  test('rejeita um venda_id de outra empresa', async ({ assert }) => {
    const { empresa } = await createTenant()
    const outroTenant = await createTenant()
    const posOutro = await createPos(outroTenant.empresa)
    const caixaOutro = await createCaixa(outroTenant.user, posOutro)
    const vendaDeOutraEmpresa = await createVenda(caixaOutro, { total: 3000 })
    const metodo = await MetodoPagamento.create({ nome: 'Numerario', empresa_id: empresa.id } as any)

    await assert.rejects(() =>
      createvendapagamentoValidator.validate({
        venda_id: vendaDeOutraEmpresa.id,
        metodo_pagamento_id: metodo.id,
        valor: 3000,
        params: { company_alias: empresa.company_alias },
      })
    )
  })
})
