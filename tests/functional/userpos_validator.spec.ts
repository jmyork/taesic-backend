import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import UserPos from '#models/userpos'
import { createuserposValidator } from '#validators/userpos_validator'
import UserPosRepository from '#repositories/userpos_repository'
import { createTenant, createUser, createPos } from '../helpers/fixtures.js'

/**
 * Associação utilizador ↔ posto de venda.
 *
 * O validator tinha duas regras de unicidade separadas — uma em `user_id`, outra em
 * `pos_id` — e cada uma rejeitava QUALQUER associação já existente desse lado:
 *  - um utilizador só podia pertencer a UM posto;
 *  - e, pior, assim que um posto tinha um utilizador, mais ninguém lá podia entrar.
 *
 * A base de dados já permitia N:N desde `alter_userpos_permitir_multiplos` (unique
 * composta user+pos); só o validator é que continuava a impor 1:1. A regra correcta é
 * rejeitar apenas o MESMO PAR.
 */
// `params` viaja dentro dos próprios dados — é assim que o controller o entrega
// (`request.validateUsing` injecta `params` no payload) e é de lá que os `.exists()`
// deste validator lêem `field.data.params.company_alias`.
function validar(dados: { user_id: string; pos_id: string }, companyAlias: string) {
  return createuserposValidator.validate({
    ...dados,
    params: { company_alias: companyAlias },
  } as any)
}

test.group('userpos — associar utilizador a postos', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('o mesmo utilizador pode ser associado a VÁRIOS postos', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const posA = await createPos(empresa)
    const posB = await createPos(empresa)

    await UserPos.create({ user_id: user.id, pos_id: posA.id })

    // Era aqui que rebentava: o utilizador já tinha um posto, logo era rejeitado.
    const saida = await validar({ user_id: user.id, pos_id: posB.id }, empresa.company_alias)
    assert.equal(saida.user_id, user.id)
    assert.equal(saida.pos_id, posB.id)
  })

  test('o mesmo posto pode receber VÁRIOS utilizadores', async ({ assert }) => {
    const { empresa, user: primeiro } = await createTenant()
    const segundo = await createUser(empresa, ['Vendedor'])
    const pos = await createPos(empresa)

    await UserPos.create({ user_id: primeiro.id, pos_id: pos.id })

    // E aqui: o posto já tinha alguém, por isso ninguém mais podia ser adicionado.
    const saida = await validar({ user_id: segundo.id, pos_id: pos.id }, empresa.company_alias)
    assert.equal(saida.user_id, segundo.id)
    assert.equal(saida.pos_id, pos.id)
  })

  test('o mesmo par utilizador+posto continua a ser rejeitado', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const pos = await createPos(empresa)
    await UserPos.create({ user_id: user.id, pos_id: pos.id })

    await assert.rejects(() => validar({ user_id: user.id, pos_id: pos.id }, empresa.company_alias))
  })

  test('um par removido (soft delete) pode voltar a ser criado', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const pos = await createPos(empresa)
    const associacao = await UserPos.create({ user_id: user.id, pos_id: pos.id })

    associacao.deletedAt = (await import('luxon')).DateTime.now()
    await associacao.save()

    const saida = await validar({ user_id: user.id, pos_id: pos.id }, empresa.company_alias)
    assert.equal(saida.pos_id, pos.id)
  })

  test('não atravessa tenants: posto de outra empresa é rejeitado', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()
    const posDeB = await createPos(tenantB.empresa)

    await assert.rejects(() =>
      validar({ user_id: tenantA.user.id, pos_id: posDeB.id }, tenantA.empresa.company_alias)
    )
  })
})

/**
 * Estes testes vão até ao INSERT real, ao contrário do grupo acima que só exercita o
 * validator. Foi exactamente essa a lacuna que deixou passar um ER_DUP_ENTRY em
 * produção: o validator aprovava (só olha para associações activas) e a base de dados
 * recusava (a unique composta cobre também as linhas com `deleted_at`).
 */
test.group('userpos — reassociar depois de remover', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('reassociar um par removido revive a linha, sem ER_DUP_ENTRY', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const pos = await createPos(empresa)
    const repo = new UserPosRepository()

    const criada = await repo.create({
      user_id: user.id,
      pos_id: pos.id,
      company_alias: empresa.company_alias,
    } as any)

    await repo.softDelete(criada.id, empresa.company_alias)
    assert.isNotNull((await UserPos.findOrFail(criada.id)).deletedAt, 'devia estar removida')

    // Antes da correcção isto rebentava com ER_DUP_ENTRY (500).
    const revivida = await repo.create({
      user_id: user.id,
      pos_id: pos.id,
      company_alias: empresa.company_alias,
    } as any)

    assert.equal(revivida.id, criada.id, 'deve reutilizar a linha, não criar outra')
    assert.isNull((await UserPos.findOrFail(criada.id)).deletedAt)

    const total = await UserPos.query().where('user_id', user.id).where('pos_id', pos.id)
    assert.lengthOf(total, 1, 'nunca pode ficar histórico duplicado do mesmo par')
  })

  test('associar um par novo continua a criar uma linha', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    const posA = await createPos(empresa)
    const posB = await createPos(empresa)
    const repo = new UserPosRepository()

    const a = await repo.create({ user_id: user.id, pos_id: posA.id, company_alias: empresa.company_alias } as any)
    const b = await repo.create({ user_id: user.id, pos_id: posB.id, company_alias: empresa.company_alias } as any)

    assert.notEqual(a.id, b.id)
    assert.lengthOf(await UserPos.query().where('user_id', user.id), 2)
  })
})
