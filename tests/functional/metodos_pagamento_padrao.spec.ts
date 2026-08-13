import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import MetodoPagamento from '#models/metodopagamento'
import {
  METODOS_PAGAMENTO_PADRAO,
  semearMetodosPagamento,
} from '../../app/helpers/metodos_pagamento_padrao.js'
import { createEmpresa } from '../helpers/fixtures.js'

/**
 * Uma empresa nova nascia sem nenhum método de pagamento. Como `vendas.close()` exige
 * um `vendapagamento` (e este um `metodo_pagamento_id` real), o PDV tentava criá-los
 * na primeira venda — mas o RBAC só dá `domain_metodo_pagamento.store` ao Admin, por
 * isso um Vendedor numa empresa acabada de registar ficava impedido de vender.
 */
test.group('métodos de pagamento por omissão', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('semear cria os três métodos tradicionais na empresa', async ({ assert }) => {
    const empresa = await createEmpresa()

    await semearMetodosPagamento(empresa.id)

    const criados = await MetodoPagamento.query().where('empresa_id', empresa.id)
    const nomes = criados.map((m) => m.nome).sort()

    assert.deepEqual(nomes, [...METODOS_PAGAMENTO_PADRAO.map((m) => m.nome)].sort())
    assert.lengthOf(criados, 3)
  })

  test('os nomes casam com os padrões que o PDV usa para os reconhecer', async ({ assert }) => {
    const empresa = await createEmpresa()
    await semearMetodosPagamento(empresa.id)
    const nomes = (await MetodoPagamento.query().where('empresa_id', empresa.id)).map((m) => m.nome)

    // Exactamente os mesmos regex de METODO_PAGAMENTO_MATCH no frontend
    // (pdv/vendas/completeSale/pageContext.tsx). Se isto falhar, o PDV não os
    // encontra e volta a tentar criá-los — o bug regressa em silêncio.
    for (const padrao of [/numer/i, /tpa|multicaixa/i, /transfer/i]) {
      assert.isTrue(
        nomes.some((n) => padrao.test(n)),
        `nenhum método criado corresponde a ${padrao}`
      )
    }
  })

  test('é idempotente — correr duas vezes não duplica', async ({ assert }) => {
    const empresa = await createEmpresa()

    await semearMetodosPagamento(empresa.id)
    const segunda = await semearMetodosPagamento(empresa.id)

    assert.lengthOf(segunda, 0, 'a segunda passagem não devia criar nada')
    const total = await MetodoPagamento.query().where('empresa_id', empresa.id)
    assert.lengthOf(total, 3)
  })

  test('só cria os que faltam, sem tocar nos que a empresa já tinha', async ({ assert }) => {
    const empresa = await createEmpresa()
    await MetodoPagamento.create({
      nome: 'Numerário',
      descricao: 'Criado à mão pelo utilizador',
      empresa_id: empresa.id,
    })

    const criados = await semearMetodosPagamento(empresa.id)

    assert.lengthOf(criados, 2, 'só faltavam TPA e Transferência')
    const numerario = await MetodoPagamento.query()
      .where('empresa_id', empresa.id)
      .where('nome', 'Numerário')
    assert.lengthOf(numerario, 1, 'não pode duplicar o que já existia')
    assert.equal(numerario[0].descricao, 'Criado à mão pelo utilizador', 'não pode sobrepor')
  })

  test('cada empresa recebe os seus — não são partilhados entre tenants', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()

    await semearMetodosPagamento(empresaA.id)
    await semearMetodosPagamento(empresaB.id)

    const deA = await MetodoPagamento.query().where('empresa_id', empresaA.id)
    const deB = await MetodoPagamento.query().where('empresa_id', empresaB.id)

    assert.lengthOf(deA, 3)
    assert.lengthOf(deB, 3)
    assert.notDeepEqual(
      deA.map((m) => m.id).sort(),
      deB.map((m) => m.id).sort()
    )
  })
})
