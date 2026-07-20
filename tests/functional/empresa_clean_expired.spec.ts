import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Empresa from '#models/empresa'
import EmpresaRepository from '#repositories/empresa_repository'
import VerificationTokenHashService from '#services/verification_token_hash_service'
import VerificationTokenHash from '#models/verification_token_hash'
import { createEmpresa } from '../helpers/fixtures.js'

/**
 * Regressão para `empresa:clean:expired` (node ace commands/empresa_clean_expired.ts):
 * a versão antiga filtrava `empresa.verifiyed` (nome de coluna errado) e
 * `empresa.verification_token_expires_at` (coluna que não existe em `empresa` — a
 * expiração vive em `verification_token_hash`), pelo que o comando falhava sempre com
 * erro de SQL e nunca apagou nenhuma empresa. Estes testes cobrem a lógica agora movida
 * para `EmpresaRepository.deleteExpiredUnverified`.
 */
test.group('EmpresaRepository.deleteExpiredUnverified', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function criarEmpresaPorVerificar(expiresAt: DateTime) {
    const empresa = await createEmpresa()
    empresa.verified = false
    await empresa.save()

    const tokenService = new VerificationTokenHashService()
    const { id } = await tokenService.createToken({
      empresa_id: empresa.id,
      purpose: 'account_activation',
    })
    const token = await VerificationTokenHash.findOrFail(id)
    token.verification_token_expires_at = expiresAt
    await token.save()

    return empresa
  }

  test('remove empresa não verificada cujo token de ativação expirou', async ({ assert }) => {
    const empresa = await criarEmpresaPorVerificar(DateTime.now().minus({ hours: 1 }))

    const deletedCount = await new EmpresaRepository().deleteExpiredUnverified()

    assert.equal(deletedCount, 1)
    await assert.rejects(() => Empresa.findOrFail(empresa.id))
  })

  test('não remove empresa cujo token de ativação ainda é válido', async ({ assert }) => {
    const empresa = await criarEmpresaPorVerificar(DateTime.now().plus({ hours: 1 }))

    await new EmpresaRepository().deleteExpiredUnverified()

    const aindaExiste = await Empresa.findOrFail(empresa.id)
    assert.equal(aindaExiste.id, empresa.id)
  })

  test('não remove empresa já verificada mesmo com token expirado', async ({ assert }) => {
    const empresa = await createEmpresa() // fixture cria já com verified: true
    const tokenService = new VerificationTokenHashService()
    const { id } = await tokenService.createToken({
      empresa_id: empresa.id,
      purpose: 'account_activation',
    })
    const token = await VerificationTokenHash.findOrFail(id)
    token.verification_token_expires_at = DateTime.now().minus({ hours: 1 })
    await token.save()

    await new EmpresaRepository().deleteExpiredUnverified()

    const aindaExiste = await Empresa.findOrFail(empresa.id)
    assert.equal(aindaExiste.id, empresa.id)
  })

  test('devolve 0 quando não há nenhuma empresa expirada', async ({ assert }) => {
    const deletedCount = await new EmpresaRepository().deleteExpiredUnverified()
    assert.equal(deletedCount, 0)
  })
})
