import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import DespesasRepository from '#repositories/despesas_repository'
import { createTenant } from '../helpers/fixtures.js'

test.group('despesas_repository - CRUD e isolamento por tenant', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('create() associa a despesa à empresa do company_alias indicado', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const repo = new DespesasRepository()

    const despesa = await repo.create({
      categoria: 'Renda',
      valor: 50000,
      data_despesa: new Date(),
      company_alias: empresa.company_alias,
      registrado_por: user.id,
    })

    assert.equal(despesa.empresa_id, empresa.id)
    assert.equal(Number(despesa.valor), 50000)
  })

  test('paginate() só devolve despesas da própria empresa', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()
    const repo = new DespesasRepository()

    const despesaA = await repo.create({
      categoria: 'Renda',
      valor: 1000,
      data_despesa: new Date(),
      company_alias: tenantA.empresa.company_alias,
      registrado_por: tenantA.user.id,
    })
    await repo.create({
      categoria: 'Renda',
      valor: 2000,
      data_despesa: new Date(),
      company_alias: tenantB.empresa.company_alias,
      registrado_por: tenantB.user.id,
    })

    const resultados = await repo.paginate(1, 20, { company_alias: tenantA.empresa.company_alias })
    assert.lengthOf(resultados, 1)
    assert.equal(resultados[0].id, despesaA.id)
  })

  test('findOrFail() rejeita uma despesa de outra empresa', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()
    const repo = new DespesasRepository()

    const despesaB = await repo.create({
      categoria: 'Renda',
      valor: 1000,
      data_despesa: new Date(),
      company_alias: tenantB.empresa.company_alias,
      registrado_por: tenantB.user.id,
    })

    await assert.rejects(() => repo.findOrFail(despesaB.id, tenantA.empresa.company_alias))
  })

  test('filtra por categoria e por intervalo de valor', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const repo = new DespesasRepository()

    const renda = await repo.create({
      categoria: 'Renda',
      valor: 50000,
      data_despesa: new Date(),
      company_alias: empresa.company_alias,
      registrado_por: user.id,
    })
    await repo.create({
      categoria: 'Salários',
      valor: 200000,
      data_despesa: new Date(),
      company_alias: empresa.company_alias,
      registrado_por: user.id,
    })

    const porCategoria = await repo.paginate(1, 20, { categoria: 'Renda', company_alias: empresa.company_alias })
    assert.lengthOf(porCategoria, 1)
    assert.equal(porCategoria[0].id, renda.id)

    const porValor = await repo.paginate(1, 20, {
      valor_start: 100000,
      valor_end: 300000,
      company_alias: empresa.company_alias,
    })
    assert.lengthOf(porValor, 1)
    assert.notEqual(porValor[0].id, renda.id)
  })

  test('softDelete() alterna deletedAt', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const repo = new DespesasRepository()

    const despesa = await repo.create({
      categoria: 'Renda',
      valor: 1000,
      data_despesa: new Date(),
      company_alias: empresa.company_alias,
      registrado_por: user.id,
    })

    await repo.softDelete(despesa.id, empresa.company_alias)
    const apagada = await repo.findOrFail(despesa.id, empresa.company_alias)
    assert.isNotNull(apagada.deletedAt)

    await repo.softDelete(despesa.id, empresa.company_alias)
    const restaurada = await repo.findOrFail(despesa.id, empresa.company_alias)
    assert.isNull(restaurada.deletedAt)
  })
})
