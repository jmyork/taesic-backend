import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import PromotorRepository from '#repositories/promotor_repository'
import CupomRepository from '#repositories/cupom_repository'
import { createEmpresa } from '../helpers/fixtures.js'

test.group('cupom_repository', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('cria um cupão para um promotor de domínio na SUA própria empresa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'Promotor Domain',
      email: `pd-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })

    const cupomRepo = new CupomRepository()
    const cupom = await cupomRepo.create({
      promotor_id: promotor.id,
      desconto: 15,
      company_alias: empresa.company_alias,
    })

    assert.equal(cupom.empresa_id, empresa.id)
    assert.equal(cupom.promotor_id, promotor.id)
    assert.equal(cupom.desconto, 15)
    assert.isString(cupom.codigo)
  })

  test('rejeita criar cupão para um promotor de domínio de OUTRA empresa', async ({ assert }) => {
    const empresaDoPromotor = await createEmpresa()
    const outraEmpresa = await createEmpresa()
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'Promotor Exclusivo',
      email: `pe-${Date.now()}@example.com`,
      company_alias: empresaDoPromotor.company_alias,
    })

    const cupomRepo = new CupomRepository()
    await assert.rejects(
      () => cupomRepo.create({ promotor_id: promotor.id, desconto: 10, company_alias: outraEmpresa.company_alias }),
      /PROMOTOR_EMPRESA_MISMATCH|pertence a outra empresa/
    )
  })

  test('permite criar cupão para um promotor de PLATAFORMA em qualquer empresa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const promotorRepo = new PromotorRepository()
    const promotorPlataforma = await promotorRepo.create({
      nome: 'Promotor Global',
      email: `pg-${Date.now()}@example.com`,
    })

    const cupomRepo = new CupomRepository()
    const cupom = await cupomRepo.create({
      promotor_id: promotorPlataforma.id,
      desconto: 20,
      company_alias: empresa.company_alias,
    })

    assert.equal(cupom.empresa_id, empresa.id)
  })

  test('gera automaticamente um código único quando não fornecido', async ({ assert }) => {
    const empresa = await createEmpresa()
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'P',
      email: `codigo-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()

    const c1 = await cupomRepo.create({ promotor_id: promotor.id, desconto: 5, company_alias: empresa.company_alias })
    const c2 = await cupomRepo.create({ promotor_id: promotor.id, desconto: 5, company_alias: empresa.company_alias })

    assert.notEqual(c1.codigo, c2.codigo)
  })

  test('findValidoPorCodigo encontra um cupão válido, não expirado, da empresa certa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'P',
      email: `valido-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupom = await cupomRepo.create({ promotor_id: promotor.id, desconto: 10, company_alias: empresa.company_alias })

    const encontrado = await cupomRepo.findValidoPorCodigo(cupom.codigo, empresa.company_alias)
    assert.isNotNull(encontrado)
    assert.equal(encontrado!.id, cupom.id)
  })

  test('findValidoPorCodigo devolve null para um cupão expirado', async ({ assert }) => {
    const empresa = await createEmpresa()
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'P',
      email: `expirado-${Date.now()}@example.com`,
      company_alias: empresa.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupom = await cupomRepo.create({
      promotor_id: promotor.id,
      desconto: 10,
      validade: DateTime.now().minus({ days: 1 }).toJSDate(),
      company_alias: empresa.company_alias,
    })

    const encontrado = await cupomRepo.findValidoPorCodigo(cupom.codigo, empresa.company_alias)
    assert.isNull(encontrado)
  })

  test('findValidoPorCodigo devolve null quando o código pertence a OUTRA empresa', async ({ assert }) => {
    const empresaDona = await createEmpresa()
    const outraEmpresa = await createEmpresa()
    const promotorRepo = new PromotorRepository()
    const promotor = await promotorRepo.create({
      nome: 'P',
      email: `cross-${Date.now()}@example.com`,
      company_alias: empresaDona.company_alias,
    })
    const cupomRepo = new CupomRepository()
    const cupom = await cupomRepo.create({ promotor_id: promotor.id, desconto: 10, company_alias: empresaDona.company_alias })

    const encontrado = await cupomRepo.findValidoPorCodigo(cupom.codigo, outraEmpresa.company_alias)
    assert.isNull(encontrado)
  })
})
