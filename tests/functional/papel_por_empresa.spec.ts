import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Papel, { ESCOPO_PAPEL } from '#models/auth/papel'
import UserPapel from '#models/auth/user_papel'
import Permissao from '#models/auth/permissao'
import papel_permissao from '#models/auth/papel_permissao'
import {
  userHasPlatformRole,
  userHasPermission,
  getUserRoles,
  giveRoleToUser,
} from '../../app/helpers/Utils.js'
import { clonarPapeisPadrao, nomeDePapelReservado } from '../../app/helpers/papeis_da_empresa.js'
import { createEmpresa, createUser } from '../helpers/fixtures.js'

/**
 * Os papéis passaram a pertencer a uma empresa. Este ficheiro cobre as garantias
 * que essa mudança CRIOU a necessidade de garantir — não as que já existiam.
 *
 * A mais importante é a primeira: enquanto `papel.nome` era único globalmente,
 * `AdminOnlyMiddleware` podia reconhecer o dono da plataforma por
 * `nome LIKE 'Platform_%'`. A partir do momento em que cada empresa cria os seus
 * papéis, essa verificação passou a ser uma via de escalada — bastava a uma
 * empresa criar um papel chamado `Platform_Admin` e atribuí-lo a si mesma.
 * A decisão passou para `papel.escopo`, uma coluna que nenhum inquilino consegue
 * pôr a `plataforma`.
 */
test.group('papel por empresa — isolamento e escalada', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('cada empresa nasce com a SUA cópia dos papéis padrão', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()

    const papeisA = await Papel.query()
      .where('empresa_id', empresaA.id)
      .where('escopo', ESCOPO_PAPEL.empresa)
    const papeisB = await Papel.query()
      .where('empresa_id', empresaB.id)
      .where('escopo', ESCOPO_PAPEL.empresa)

    assert.isTrue(papeisA.length >= 10, 'a empresa A tem os padrões')
    assert.equal(papeisA.length, papeisB.length, 'as duas recebem o mesmo conjunto')

    // O que era impossível antes: `papel.nome` tinha unicidade GLOBAL.
    const idsA = new Set(papeisA.map((p) => p.id))
    assert.isFalse(papeisB.some((p) => idsA.has(p.id)), 'não partilham nenhuma linha')
    assert.isTrue(
      papeisA.some((p) => p.nome === 'Vendedor') && papeisB.some((p) => p.nome === 'Vendedor'),
      'as duas podem ter um "Vendedor" próprio'
    )
  })

  test('as permissões do padrão são copiadas com o papel', async ({ assert }) => {
    const empresa = await createEmpresa()

    const adminDaEmpresa = await Papel.query()
      .where('empresa_id', empresa.id)
      .where('nome', 'Admin')
      .firstOrFail()

    const ligacoes = await papel_permissao
      .query()
      .where('papel_id', adminDaEmpresa.id)
      .whereNull('deleted_at')

    assert.isTrue(
      ligacoes.length > 50,
      `o Admin da empresa tem de herdar as permissões do modelo (tem ${ligacoes.length})`
    )
  })

  test('um papel de empresa chamado "Platform_Admin" NÃO dá acesso de plataforma', async ({
    assert,
  }) => {
    // Esta é a escalada. Antes, `AdminOnlyMiddleware` fazia
    // `Papel.query().where('nome','like','Platform_%')` e comparava por nome — o
    // que passava a ser suficiente para um inquilino entrar no backoffice.
    const empresa = await createEmpresa()
    const user = await createUser(empresa)

    const papelDisfarcado = await Papel.create({
      nome: 'Platform_Admin',
      descricao: 'tentativa de escalada',
      empresa_id: empresa.id,
      escopo: ESCOPO_PAPEL.empresa,
    })

    await UserPapel.create({ user_id: user.id, papel_id: papelDisfarcado.id })

    assert.isFalse(
      await userHasPlatformRole(user),
      'um papel de empresa nunca é papel de plataforma, chame-se ele o que quiser'
    )

    // E o nome continua a aparecer nos papéis do utilizador — o que prova que a
    // recusa vem do `escopo`, não de o papel ter sido ignorado.
    const papeis = await getUserRoles(user)
    assert.isTrue(papeis.some((p) => p.nome === 'Platform_Admin'))
  })

  test('a base de dados recusa um papel de empresa sem empresa, e vice-versa', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()

    // O invariante não depende de nenhum programador o respeitar.
    await assert.rejects(
      () =>
        Papel.create({
          nome: `sem-empresa-${Date.now()}`,
          descricao: 'escopo empresa sem empresa_id',
          escopo: ESCOPO_PAPEL.empresa,
          empresa_id: null,
        }) as any
    )

    await assert.rejects(
      () =>
        Papel.create({
          nome: `plataforma-com-empresa-${Date.now()}`,
          descricao: 'escopo plataforma com empresa_id',
          escopo: ESCOPO_PAPEL.plataforma,
          empresa_id: empresa.id,
        }) as any
    )
  })

  test('o mesmo nome de papel duas vezes na MESMA empresa é recusado', async ({ assert }) => {
    const empresa = await createEmpresa()

    // "Vendedor" já existe nesta empresa (vem do clone dos padrões).
    await assert.rejects(
      () =>
        Papel.create({
          nome: 'Vendedor',
          descricao: 'duplicado',
          empresa_id: empresa.id,
          escopo: ESCOPO_PAPEL.empresa,
        }) as any
    )
  })

  test('o prefixo Platform_ é recusado a uma empresa antes de chegar à BD', async ({ assert }) => {
    // Já não é o que decide autorização — é para o nome não induzir em erro quem
    // lê um ecrã de gestão ou uma linha de auditoria.
    assert.isTrue(nomeDePapelReservado('Platform_Admin'))
    assert.isTrue(nomeDePapelReservado('  platform_qualquercoisa'))
    assert.isFalse(nomeDePapelReservado('Vendedor'))
    assert.isFalse(nomeDePapelReservado('Chefe de Turno'))
  })

  test('o papel de OUTRA empresa não concede permissão nenhuma', async ({ assert }) => {
    // Segunda tranca: mesmo que uma linha errada exista em `user_papel` — deixada
    // por uma migração, escrita à mão —, não concede nada.
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const userA = await createUser(empresaA)

    const adminDaB = await Papel.query()
      .where('empresa_id', empresaB.id)
      .where('nome', 'Admin')
      .firstOrFail()

    const permissao = await Permissao.query()
      .join('papel_permissao', 'papel_permissao.permissao_id', 'permissao.id')
      .where('papel_permissao.papel_id', adminDaB.id)
      .whereNull('papel_permissao.deleted_at')
      .select('permissao.nome')
      .firstOrFail()

    // A atribuição é criada à força, a passar por cima do repositório.
    await UserPapel.create({ user_id: userA.id, papel_id: adminDaB.id })

    assert.isFalse(
      await userHasPermission(userA, permissao.nome),
      'o papel de outra empresa não pode conceder nada'
    )
  })

  test('um papel apagado (soft delete) deixa de conceder as suas permissões', async ({
    assert,
  }) => {
    // Isto não fazia diferença enquanto ninguém podia apagar papéis. Passa a fazer
    // no momento em que cada empresa pode apagar os seus.
    const empresa = await createEmpresa()
    const user = await createUser(empresa, ['Admin'])

    const admin = await Papel.query()
      .where('empresa_id', empresa.id)
      .where('nome', 'Admin')
      .firstOrFail()

    const permissao = await Permissao.query()
      .join('papel_permissao', 'papel_permissao.permissao_id', 'permissao.id')
      .where('papel_permissao.papel_id', admin.id)
      .whereNull('papel_permissao.deleted_at')
      .select('permissao.nome')
      .firstOrFail()

    assert.isTrue(await userHasPermission(user, permissao.nome), 'antes de apagar, concede')

    admin.deletedAt = (await import('luxon')).DateTime.now()
    await admin.save()

    assert.isFalse(await userHasPermission(user, permissao.nome), 'depois de apagar, não concede')
  })

  test('giveRoleToUser resolve o papel na empresa DO utilizador', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const userA = await createUser(empresaA)

    await giveRoleToUser(userA, 'Vendedor')

    const atribuido = await UserPapel.query()
      .where('user_id', userA.id)
      .whereNull('deleted_at')
      .preload('papel')
      .firstOrFail()

    assert.equal(atribuido.papel.empresa_id, empresaA.id, 'o papel atribuído é o da empresa A')
    assert.notEqual(atribuido.papel.empresa_id, empresaB.id)
  })

  test('giveRoleToUser falha alto quando o papel não existe no âmbito', async ({ assert }) => {
    // Antes: `?.id || ''`, que produzia um erro de chave estrangeira sem relação
    // visível com a causa — ou, se a FK fosse relaxada, uma atribuição perdida em
    // silêncio.
    const empresa = await createEmpresa()
    const user = await createUser(empresa)

    await assert.rejects(
      () => giveRoleToUser(user, 'PapelQueNaoExiste'),
      /Não existe o papel "PapelQueNaoExiste"/
    )
  })

  test('clonarPapeisPadrao é idempotente', async ({ assert }) => {
    const empresa = await createEmpresa()

    const antes = await Papel.query().where('empresa_id', empresa.id).count('* as total')
    const criados = await clonarPapeisPadrao(empresa.id)
    const depois = await Papel.query().where('empresa_id', empresa.id).count('* as total')

    assert.equal(criados, 0, 'nada a clonar na segunda vez')
    assert.deepEqual(
      Number((antes[0] as any).$extras.total),
      Number((depois[0] as any).$extras.total),
      'o número de papéis não muda'
    )
  })
})
