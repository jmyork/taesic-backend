import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import empresaRepository from '#repositories/empresa_repository'

// Deliberadamente SEM testUtils.db().withGlobalTransaction() — esse helper força todas as
// queries do teste a partilhar UMA única conexão/savepoint, o que esconderia exatamente o tipo
// de contenção de lock entre conexões que este teste existe para apanhar. Por isso a limpeza é
// feita manualmente no fim.
test.group('empresaRepository.CreateEmpresaUserDetalhes — operação real de registo', (group) => {
  const criados: { userId?: string; empresaId?: string } = {}

  group.each.teardown(async () => {
    if (criados.userId) {
      await db.from('user_papel').where('user_id', criados.userId).delete()
      await db.from('pessoa').where('user_id', criados.userId).delete()
    }
    if (criados.empresaId) {
      await db.from('verification_token_hash').where('empresa_id', criados.empresaId).delete()
      await db.from('empresa').where('id', criados.empresaId).delete()
    }
    if (criados.userId) {
      await db.from('user').where('id', criados.userId).delete()
    }
    criados.userId = undefined
    criados.empresaId = undefined
  })

  test('regista empresa + user + atribui o papel Admin sem lock wait timeout', async ({ assert }) => {
    const nonce = Date.now()
    const repo = new empresaRepository()

    const resultado = await repo.CreateEmpresaUserDetalhes({
      user_username: `promo_teste_${nonce}`,
      user_email: `promo${nonce}@example.com`,
      user_password: 'password123',
      dados_nome: 'Teste',
      dados_sobrenome: 'Registo',
      empresa_nome: `Empresa Teste ${nonce}`,
      empresa_nif: `NIF-${nonce}`,
      empresa_company_alias: `empresa-teste-${nonce}`,
      empresa_contacto: '900000000',
    })

    criados.userId = resultado.user.id
    criados.empresaId = resultado.empresa.id

    assert.isTrue(resultado.empresa.id.length > 0)

    const papeis = await db.from('user_papel').where('user_id', resultado.user.id)
    assert.lengthOf(papeis, 1, 'o papel Admin devia ter sido atribuído ao novo utilizador')
  }).timeout(60000)
})
