import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import MetodoPagamentoRepository from '#repositories/metodopagamento_repository'
import { createTenant } from '../helpers/fixtures.js'

/**
 * `metodopagamento` era um recurso de plataforma, partilhado por todas as empresas, sem
 * qualquer `empresa_id`. Passou a ser isolado por tenant — `nome` deixou de ser único
 * globalmente (migrou para único por empresa) e todas as operações passam a escopar por
 * `company_alias`, tal como qualquer outro recurso de domínio.
 */
test.group('metodopagamento_repository - isolamento por tenant', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('create() associa o método à empresa do company_alias indicado', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new MetodoPagamentoRepository()

    const metodo = await repo.create({
      nome: 'Numerário',
      descricao: 'Dinheiro',
      company_alias: empresa.company_alias,
    })

    assert.equal(metodo.empresa_id, empresa.id)
  })

  test('duas empresas diferentes podem ter um método com o mesmo nome', async ({ assert }) => {
    const empresaA = (await createTenant()).empresa
    const empresaB = (await createTenant()).empresa
    const repo = new MetodoPagamentoRepository()

    const metodoA = await repo.create({
      nome: 'Numerário',
      descricao: 'Dinheiro',
      company_alias: empresaA.company_alias,
    })
    const metodoB = await repo.create({
      nome: 'Numerário',
      descricao: 'Dinheiro',
      company_alias: empresaB.company_alias,
    })

    assert.notEqual(metodoA.id, metodoB.id)
  })

  test('paginate() só devolve métodos de pagamento da própria empresa', async ({ assert }) => {
    const empresaA = (await createTenant()).empresa
    const empresaB = (await createTenant()).empresa
    const repo = new MetodoPagamentoRepository()

    const metodoA = await repo.create({
      nome: 'Numerário',
      descricao: 'x',
      company_alias: empresaA.company_alias,
    })
    await repo.create({ nome: 'Multicaixa', descricao: 'x', company_alias: empresaB.company_alias })

    const resultados = await repo.paginate(1, 20, { company_alias: empresaA.company_alias })
    assert.lengthOf(resultados, 1)
    assert.equal(resultados[0].id, metodoA.id)
  })

  test('findOrFail() rejeita um método de pagamento de outra empresa', async ({ assert }) => {
    const empresaA = (await createTenant()).empresa
    const empresaB = (await createTenant()).empresa
    const repo = new MetodoPagamentoRepository()

    const metodoB = await repo.create({
      nome: 'Numerário',
      descricao: 'x',
      company_alias: empresaB.company_alias,
    })

    await assert.rejects(() => repo.findOrFail(metodoB.id, empresaA.company_alias))
  })

  test('update()/softDelete() respeitam o mesmo isolamento por tenant', async ({ assert }) => {
    const empresaA = (await createTenant()).empresa
    const empresaB = (await createTenant()).empresa
    const repo = new MetodoPagamentoRepository()

    const metodoB = await repo.create({
      nome: 'Numerário',
      descricao: 'x',
      company_alias: empresaB.company_alias,
    })

    await assert.rejects(() =>
      repo.update(metodoB.id, { descricao: 'alterado' }, empresaA.company_alias)
    )
    await assert.rejects(() => repo.softDelete(metodoB.id, empresaA.company_alias))
  })
})
