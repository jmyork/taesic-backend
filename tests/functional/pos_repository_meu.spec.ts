import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import testUtils from '@adonisjs/core/services/test_utils'
import PosRepository from '#repositories/pos_repository'
import UserPos from '#models/userpos'
import { userHasPermission } from '../../app/helpers/Utils.js'
import { createTenant, createUser, createPos } from '../helpers/fixtures.js'

/**
 * `pos_repository.listByUser()` — análogo ao `caixa_repository.listByUser()` (ver
 * `caixa_repository_filtros.spec.ts`), mas a associação user↔pos passa pela tabela
 * `userpos` (não há `pos.user_id` directo), daí o join em vez de um simples `where`.
 *
 * `userpos.user_id`/`userpos.pos_id` tinham cada um a sua própria constraint
 * `unique()` (migration `1779132357685_alter_userpos.ts`), impedindo de facto um
 * utilizador de ter mais do que um pos — bug corrigido em
 * `1784662475779_alter_userpos_permitir_multiplos.ts` (substituída por uma unique
 * composta, que só impede duplicar a mesma associação). Os testes abaixo cobrem o
 * cenário real de N:N que essa correcção veio destravar.
 */
test.group('pos_repository.listByUser() — "os meus pos"', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('devolve só os pos associados ao utilizador, via userpos', async ({ assert }) => {
    const { empresa, user, pos: posDoUser } = await createTenant()
    const outroPos = await createPos(empresa)
    const outroUser = await createUser(empresa)

    await UserPos.create({ user_id: user.id, pos_id: posDoUser.id })
    await UserPos.create({ user_id: outroUser.id, pos_id: outroPos.id })

    const repo = new PosRepository()
    const meus = await repo.listByUser(user.id)

    assert.lengthOf(meus, 1)
    assert.equal(meus[0].id, posDoUser.id)
  })

  test('devolve todos os pos do utilizador quando associado a mais do que um', async ({ assert }) => {
    const { empresa, user, pos: posA } = await createTenant()
    const posB = await createPos(empresa)
    const posC = await createPos(empresa)

    await UserPos.create({ user_id: user.id, pos_id: posA.id })
    await UserPos.create({ user_id: user.id, pos_id: posB.id })
    await UserPos.create({ user_id: user.id, pos_id: posC.id })

    const repo = new PosRepository()
    const meus = await repo.listByUser(user.id)

    assert.lengthOf(meus, 3)
    assert.sameMembers(
      meus.map((p: any) => p.id),
      [posA.id, posB.id, posC.id]
    )
  })

  test('o mesmo pos pode ser partilhado por vários utilizadores', async ({ assert }) => {
    const { empresa, user: userA, pos: posPartilhado } = await createTenant()
    const userB = await createUser(empresa)

    await UserPos.create({ user_id: userA.id, pos_id: posPartilhado.id })
    await UserPos.create({ user_id: userB.id, pos_id: posPartilhado.id })

    const repo = new PosRepository()
    const meusA = await repo.listByUser(userA.id)
    const meusB = await repo.listByUser(userB.id)

    assert.lengthOf(meusA, 1)
    assert.lengthOf(meusB, 1)
    assert.equal(meusA[0].id, posPartilhado.id)
    assert.equal(meusB[0].id, posPartilhado.id)
  })

  test('ignora associações userpos removidas (soft delete)', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const posDesassociado = await createPos(empresa)

    const associacaoRemovida = await UserPos.create({ user_id: user.id, pos_id: posDesassociado.id })
    associacaoRemovida.deletedAt = DateTime.now()
    await associacaoRemovida.save()

    const repo = new PosRepository()
    const meus = await repo.listByUser(user.id)

    assert.lengthOf(meus, 0)
  })

  test('filtra por nome mesmo dentro dos pos do utilizador', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const posAlfa = await createPos(empresa, { nome: 'POS Alfa' })

    await UserPos.create({ user_id: user.id, pos_id: posAlfa.id })

    const repo = new PosRepository()
    const encontrado = await repo.listByUser(user.id, { nome: 'Alfa' } as any)
    const naoEncontrado = await repo.listByUser(user.id, { nome: 'Inexistente' } as any)

    assert.lengthOf(encontrado, 1)
    assert.equal(encontrado[0].id, posAlfa.id)
    assert.lengthOf(naoEncontrado, 0)
  })
})

test.group('RBAC - domain_pos.meu', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('Admin, Vendedor, Gerente e Supervisor têm acesso a "os meus pos"', async ({ assert }) => {
    const { empresa, user: admin } = await createTenant()
    const vendedor = await createUser(empresa, ['Vendedor'])
    const gerente = await createUser(empresa, ['Gerente'])
    const supervisor = await createUser(empresa, ['Supervisor'])

    for (const user of [admin, vendedor, gerente, supervisor]) {
      assert.isTrue(await userHasPermission(user, 'domain_pos.meu'))
    }
  })

  test('Estoquista, EstoquistaVisualizador, VendedorVisualizador e AdminVisualizador não têm acesso', async ({
    assert,
  }) => {
    const { empresa } = await createTenant()
    const estoquista = await createUser(empresa, ['Estoquista'])
    const estoquistaVisualizador = await createUser(empresa, ['EstoquistaVisualizador'])
    const vendedorVisualizador = await createUser(empresa, ['VendedorVisualizador'])
    const adminVisualizador = await createUser(empresa, ['AdminVisualizador'])

    for (const user of [estoquista, estoquistaVisualizador, vendedorVisualizador, adminVisualizador]) {
      assert.isFalse(await userHasPermission(user, 'domain_pos.meu'))
    }
  })
})
