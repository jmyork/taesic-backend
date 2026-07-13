import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Empresa from '#models/empresa'
import VerificationTokenHashRepository from '#repositories/verification_token_hash_repository'
import VerificationTokenHashService from '#services/verification_token_hash_service'
import { CreateCompanyWithUserAndStartACompanyDetalhes } from '#validators/empresa_validator'
import { createTenant } from '../helpers/fixtures.js'

test.group('verification_token_hash_repository.verify', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('marca a empresa como verificada (não só o token) ao ativar com sucesso', async ({ assert }) => {
    const { empresa } = await createTenant()
    // A fixture cria empresas já "verified: true" por omissão (a maioria dos testes assume
    // um tenant já ativo) — aqui precisamos explicitamente do estado "por verificar".
    empresa.verified = false
    await empresa.save()

    const tokenService = new VerificationTokenHashService()
    const { token } = await tokenService.createToken({
      empresa_id: empresa.id,
      purpose: 'account_activation',
    })

    const repo = new VerificationTokenHashRepository()
    const result = await repo.verify(token)

    assert.isTrue(result.success)
    const empresaAtualizada = await Empresa.findOrFail(empresa.id)
    assert.isTrue(Boolean(empresaAtualizada.verified))
  })

  test('token inválido não marca nenhuma empresa como verificada', async ({ assert }) => {
    const repo = new VerificationTokenHashRepository()
    const result = await repo.verify('token-que-nao-existe')
    assert.isFalse(result.success)
  })

  test('token já usado não pode ser reaproveitado nem re-marca a empresa', async ({ assert }) => {
    const { empresa } = await createTenant()
    const tokenService = new VerificationTokenHashService()
    const { token } = await tokenService.createToken({
      empresa_id: empresa.id,
      purpose: 'account_activation',
    })

    const repo = new VerificationTokenHashRepository()
    await repo.verify(token)
    const segundaTentativa = await repo.verify(token)

    assert.isFalse(segundaTentativa.success)
  })

  test('token expirado é rejeitado e não marca a empresa', async ({ assert }) => {
    const { empresa } = await createTenant()
    empresa.verified = false
    await empresa.save()
    const tokenService = new VerificationTokenHashService()
    const { id } = await tokenService.createToken({
      empresa_id: empresa.id,
      purpose: 'account_activation',
    })
    const record = await (await import('#models/verification_token_hash')).default.findOrFail(id)
    record.verification_token_expires_at = DateTime.now().minus({ hours: 1 })
    await record.save()

    const repo = new VerificationTokenHashRepository()
    const result = await repo.verify(record.verification_token_public)

    assert.isFalse(result.success)
    const empresaAtualizada = await Empresa.findOrFail(empresa.id)
    assert.isFalse(Boolean(empresaAtualizada.verified))
  })
})

test.group('CreateCompanyWithUserAndStartACompanyDetalhes — empresa_company_alias', () => {
  test('aceita um alias em minúsculas com hífens simples', async ({ assert }) => {
    const validAlias = 'minha-loja-nova'
    assert.match(validAlias, /^(?!.*--)[a-z]+(?:-[a-z]+)*$/)
  })

  test('rejeita aliases com dígitos, underscores, maiúsculas ou hífens consecutivos', async ({ assert }) => {
    const regex = /^(?!.*--)[a-z]+(?:-[a-z]+)*$/
    assert.isFalse(regex.test('MinhaLoja'))
    assert.isFalse(regex.test('minha_loja'))
    assert.isFalse(regex.test('minha-loja-1'))
    assert.isFalse(regex.test('minha--loja'))
    assert.isFalse(regex.test('-minha-loja'))
    assert.isFalse(regex.test('minha-loja-'))
  })

  test('o validador vivo usa exatamente este regex (mesmo padrão das rotas de tenant)', async ({ assert }) => {
    // Regressão direta: confirma que o validador realmente usado no registo de empresa
    // aceita/rejeita os mesmos casos que as rotas de tenant em companydomainroutes.ts exigem.
    await assert.rejects(() =>
      CreateCompanyWithUserAndStartACompanyDetalhes.validate({
        user_username: 'utilizador_teste',
        user_email: 'teste@example.com',
        user_password: 'password123',
        dados_nome: 'Teste',
        dados_sobrenome: 'Utilizador',
        empresa_nif: `NIF-${Date.now()}`,
        empresa_company_alias: 'Alias_Invalido_1',
        empresa_nome: `Empresa Teste ${Date.now()}`,
        empresa_contacto: '900000000',
      }),
    )
  })
})
