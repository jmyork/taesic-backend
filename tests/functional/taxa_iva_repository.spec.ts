import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import TaxaIvaRepository from '#repositories/taxa_iva_repository'

test.group('taxa_iva_repository - CRUD (recurso de plataforma)', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('create()/findOrFail() funcionam com os campos de negócio', async ({ assert }) => {
    const repo = new TaxaIvaRepository()
    const taxa = await repo.create({ nome: 'Taxa Geral', percentual: 14 })

    assert.equal(taxa.nome, 'Taxa Geral')
    assert.equal(Number(taxa.percentual), 14)

    const encontrada = await repo.findOrFail(taxa.id)
    assert.equal(encontrada.id, taxa.id)
  })

  test('update() altera o percentual', async ({ assert }) => {
    const repo = new TaxaIvaRepository()
    const taxa = await repo.create({ nome: 'Taxa Reduzida', percentual: 7 })

    const actualizada = await repo.update(taxa.id, { percentual: 5 })
    assert.equal(Number(actualizada.percentual), 5)
  })

  test('paginate() lista as taxas criadas', async ({ assert }) => {
    const repo = new TaxaIvaRepository()
    await repo.create({ nome: 'Isento', percentual: 0 })

    const resultados = await repo.paginate(1, 20)
    assert.isAbove(resultados.length, 0)
  })

  test('softDelete() alterna deletedAt', async ({ assert }) => {
    const repo = new TaxaIvaRepository()
    const taxa = await repo.create({ nome: 'Temporária', percentual: 10 })

    await repo.softDelete(taxa.id)
    const apagada = await repo.findOrFail(taxa.id)
    assert.isNotNull(apagada.deletedAt)
  })
})
