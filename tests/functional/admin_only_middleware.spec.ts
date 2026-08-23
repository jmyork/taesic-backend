import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import AdminOnlyMiddleware from '#middleware/admin_only_middleware'
import Papel, { ESCOPO_PAPEL } from '#models/auth/papel'
import UserPapel from '#models/auth/user_papel'
import { giveRoleToUser } from '../../app/helpers/Utils.js'
import { createEmpresa, createUser } from '../helpers/fixtures.js'

/**
 * Regressão para admin_only_middleware, que antes era um no-op completo: chamava
 * `userHasRole()` sem `await` nem usar o resultado e avançava sempre para `next()`,
 * deixando qualquer utilizador autenticado passar por rotas restritas a
 * administradores da plataforma.
 *
 * Segunda regressão, acrescentada quando os papéis passaram a pertencer a uma
 * empresa: este middleware reconhecia o administrador de plataforma pelo NOME
 * (`nome LIKE 'Platform_%'`). Com cada empresa a poder criar os seus papéis, isso
 * tornou-se uma via de escalada — ver o último teste deste ficheiro.
 */
test.group('admin_only_middleware', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  async function correr(user: any) {
    const ctx = await testUtils.createHttpContext()
    ;(ctx as any).auth = { user }

    let passou = false
    await new AdminOnlyMiddleware().handle(ctx, async () => {
      passou = true
    })

    return { passou, status: ctx.response.getStatus() }
  }

  test('bloqueia um utilizador sem papel de plataforma', async ({ assert }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa) // sem papéis

    const { passou, status } = await correr(user)

    assert.isFalse(passou, 'next() não deve ser chamado para um utilizador sem papel de plataforma')
    assert.equal(status, 403)
  })

  test('deixa passar um utilizador com papel de plataforma', async ({ assert }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)

    // `escopo` explícito: dar acesso de plataforma a alguém que também tem empresa
    // é um acto deliberado, não algo que aconteça por o nome do papel calhar. Ver
    // `giveRoleToUser`.
    await giveRoleToUser(user, 'Platform_Admin', undefined, { escopo: ESCOPO_PAPEL.plataforma })

    const { passou } = await correr(user)

    assert.isTrue(passou, 'next() deve ser chamado para um utilizador com papel de plataforma')
  })

  test('um papel de EMPRESA chamado "Platform_Admin" não abre o backoffice', async ({ assert }) => {
    // A escalada que a verificação por nome permitia: `papel.nome` deixou de ser
    // único globalmente, portanto uma empresa pode criar uma linha com este nome.
    // Se o middleware ainda decidisse pelo prefixo, este utilizador entrava.
    const empresa = await createEmpresa()
    const user = await createUser(empresa)

    const disfarce = await Papel.create({
      nome: 'Platform_Admin',
      descricao: 'tentativa de escalada por nome',
      empresa_id: empresa.id,
      escopo: ESCOPO_PAPEL.empresa,
    })
    await UserPapel.create({ user_id: user.id, papel_id: disfarce.id })

    const { passou, status } = await correr(user)

    assert.isFalse(passou, 'o nome do papel não pode conceder acesso de plataforma')
    assert.equal(status, 403)
  })
})
