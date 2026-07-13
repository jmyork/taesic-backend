import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import PromotorRepository from '#repositories/promotor_repository'
import { createEmpresa } from '../helpers/fixtures.js'

test.group('promotor_repository', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('cria um promotor de domínio associado à empresa indicada', async ({ assert }) => {
    const empresa = await createEmpresa()
    const repo = new PromotorRepository()

    const promotor = await repo.create({
      nome: 'Ana Promotora',
      email: `ana-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })

    assert.equal(promotor.empresa_id, empresa.id)
    assert.isFalse(promotor.isPlataforma)
    assert.isTrue(promotor.ativo)
    assert.isString(promotor.codigo_perfil)
    assert.isAbove(promotor.codigo_perfil.length, 5)
  })

  test('cria um promotor de plataforma (sem company_alias) com empresa_id null', async ({ assert }) => {
    const repo = new PromotorRepository()

    const promotor = await repo.create({
      nome: 'Bruno Plataforma',
      email: `bruno-${Date.now()}@example.com`,
    })

    assert.isNull(promotor.empresa_id)
    assert.isTrue(promotor.isPlataforma)
  })

  test('gera códigos de perfil únicos entre promotores diferentes', async ({ assert }) => {
    const repo = new PromotorRepository()
    const nonce = Date.now()

    const p1 = await repo.create({ nome: 'P1', email: `p1-${nonce}@example.com` })
    const p2 = await repo.create({ nome: 'P2', email: `p2-${nonce}@example.com` })

    assert.notEqual(p1.codigo_perfil, p2.codigo_perfil)
  })

  test('findOrFail com company_alias só encontra promotores dessa empresa', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const repo = new PromotorRepository()

    const promotorA = await repo.create({
      nome: 'Só da A',
      email: `soA-${Date.now()}@example.com`,
      company_alias: empresaA.company_alias,
    })

    await assert.rejects(() => repo.findOrFail(promotorA.id, empresaB.company_alias))
    const encontrado = await repo.findOrFail(promotorA.id, empresaA.company_alias)
    assert.equal(encontrado.id, promotorA.id)
  })

  test('update pode desativar um promotor (ativo=false)', async ({ assert }) => {
    const empresa = await createEmpresa()
    const repo = new PromotorRepository()
    const promotor = await repo.create({
      nome: 'A Desativar',
      email: `desativar-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })

    const atualizado = await repo.update(promotor.id, { ativo: false }, empresa.company_alias)
    assert.isFalse(atualizado.ativo)
  })

  test('softDelete alterna deletedAt (eliminar e restaurar)', async ({ assert }) => {
    const empresa = await createEmpresa()
    const repo = new PromotorRepository()
    const promotor = await repo.create({
      nome: 'A Eliminar',
      email: `eliminar-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })

    await repo.softDelete(promotor.id, empresa.company_alias)
    const eliminado = await repo.baseQuery().where('id', promotor.id).firstOrFail()
    assert.isNotNull(eliminado.deletedAt)
  })

  test('paginate por omissão NÃO inclui promotores de plataforma (só os desta empresa)', async ({ assert }) => {
    const empresa = await createEmpresa()
    const repo = new PromotorRepository()
    await repo.create({ nome: 'Domain', email: `dom-${Date.now()}@example.com`, company_alias: empresa.company_alias })
    await repo.create({ nome: 'Plataforma', email: `plat-${Date.now()}@example.com` })

    const resultado = await repo.paginate(1, 50, { company_alias: empresa.company_alias })
    const nomes = resultado.toJSON().data.map((p: any) => p.nome)
    assert.include(nomes, 'Domain')
    assert.notInclude(nomes, 'Plataforma')
  })

  test('paginate com incluir_plataforma=true também mostra promotores de plataforma (para o picker de cupão)', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const outraEmpresa = await createEmpresa()
    const repo = new PromotorRepository()
    await repo.create({ nome: 'Domain', email: `dom2-${Date.now()}@example.com`, company_alias: empresa.company_alias })
    await repo.create({ nome: 'Plataforma', email: `plat2-${Date.now()}@example.com` })
    await repo.create({
      nome: 'De outra empresa',
      email: `outra2-${Date.now()}@example.com`,
      company_alias: outraEmpresa.company_alias,
    })

    const resultado = await repo.paginate(1, 50, { company_alias: empresa.company_alias, incluir_plataforma: true })
    const nomes = resultado.toJSON().data.map((p: any) => p.nome)
    assert.include(nomes, 'Domain')
    assert.include(nomes, 'Plataforma')
    assert.notInclude(nomes, 'De outra empresa')
  })
})
