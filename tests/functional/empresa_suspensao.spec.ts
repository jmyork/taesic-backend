import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import EmpresaRepository from '#repositories/empresa_repository'
import AuthRepository from '#repositories/auth_repository'
import ValidateCompanyAliasMiddleware from '#middleware/validate_company_alias_middleware'
import Empresa from '#models/empresa'
import User from '#models/user'
import VerificationTokenHash from '#models/verification_token_hash'
import { ESCOPO_PAPEL } from '#models/auth/papel'
import { giveRoleToUser } from '../../app/helpers/Utils.js'
import { paginateCatalogoProdutos } from '../../app/helpers/catalogo_produtos_query.js'
import { createEmpresa, createUser, createProduto, createLote } from '../helpers/fixtures.js'

/**
 * Suspender uma empresa — a peça que faltava para o backoffice não ser decorativo.
 *
 * Até esta sessão não havia forma de cortar o acesso a um inquilino:
 * `ValidateCompanyAliasMiddleware` verificava o alias, o dono e o `verified`, e mais
 * nada. Uma empresa comprometida, em dívida, ou registada com o NIF de outra pessoa
 * continuava a facturar até alguém ir à base de dados à mão.
 *
 * O que estes testes protegem, por ordem de importância:
 *
 *  1. a suspensão corta o acesso a TODAS as rotas de inquilino, num só ponto;
 *  2. corta-o já, e não só a quem voltar a autenticar-se — as sessões vivas morrem;
 *  3. não corta a mais ninguém (o inquilino do lado continua a trabalhar);
 *  4. quem suspende não se consegue trancar a si próprio de fora.
 */
test.group('empresa — suspensão', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  const repo = new EmpresaRepository()

  /** `login()` exige um `verification_token_hash` verificado do utilizador. */
  async function activar(user: User) {
    return VerificationTokenHash.create({
      user_id: user.id,
      verification_token_public: `verificado-${user.id}`,
      verification_token_hash: 'x',
      verification_token_expires_at: DateTime.now().plus({ hours: 24 }),
      verified: true,
      purpose: 'account_activation',
    })
  }

  async function sessoesVivas(user: User) {
    const linha = await db
      .from('auth_access_tokens')
      .where('tokenable_id', user.id)
      .count('* as total')
      .first()
    return Number(linha?.total ?? 0)
  }

  /** Corre o portão das rotas de inquilino como o faria um pedido real. */
  async function passaNoPortao(user: User, companyAlias: string) {
    const ctx = await testUtils.createHttpContext()
    ctx.params = { company_alias: companyAlias }
    ;(ctx as any).auth = { user }

    let passou = false
    await new ValidateCompanyAliasMiddleware().handle(ctx, async () => {
      passou = true
    })

    return { passou, status: ctx.response.getStatus() }
  }

  /** Um administrador de plataforma que NÃO pertence à empresa que vai suspender. */
  async function adminDaPlataforma() {
    const casa = await createEmpresa()
    const admin = await createUser(casa)
    await giveRoleToUser(admin, 'Platform_Admin', undefined, { escopo: ESCOPO_PAPEL.plataforma })
    return admin
  }

  test('suspender grava a data, o motivo e o autor', async ({ assert }) => {
    const empresa = await createEmpresa()
    const admin = await adminDaPlataforma()

    await repo.suspender({
      empresa_id: empresa.id,
      motivo: 'NIF pertence a outra empresa',
      actor_id: admin.id,
    })

    const recarregada = await Empresa.findOrFail(empresa.id)
    assert.isTrue(recarregada.estaSuspensa)
    assert.equal(recarregada.suspensa_motivo, 'NIF pertence a outra empresa')
    assert.equal(recarregada.suspensa_por, admin.id)
  })

  test('suspender revoga as sessões vivas de todos os utilizadores da empresa', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const dono = await createUser(empresa, ['Admin'])
    const vendedor = await createUser(empresa, ['Vendedor'])
    await activar(dono)
    await activar(vendedor)

    const auth = new AuthRepository()
    await auth.login({
      uid: dono.email,
      password: 'Password123!#',
      company_alias: empresa.company_alias,
    })
    await auth.login({
      uid: vendedor.email,
      password: 'Password123!#',
      company_alias: empresa.company_alias,
    })

    assert.equal(await sessoesVivas(dono), 1)
    assert.equal(await sessoesVivas(vendedor), 1)

    await repo.suspender({ empresa_id: empresa.id, motivo: 'Suspeita de fraude' })

    // Este é o ponto todo: sem isto, a suspensão só valeria para quem voltasse a
    // autenticar-se — quem já tinha um bearer token continuava a trabalhar.
    assert.equal(await sessoesVivas(dono), 0)
    assert.equal(await sessoesVivas(vendedor), 0)
  })

  test('suspender não toca nas sessões de outra empresa', async ({ assert }) => {
    const alvo = await createEmpresa()
    const vizinha = await createEmpresa()
    const doAlvo = await createUser(alvo)
    const daVizinha = await createUser(vizinha)
    await activar(doAlvo)
    await activar(daVizinha)

    const auth = new AuthRepository()
    await auth.login({
      uid: doAlvo.email,
      password: 'Password123!#',
      company_alias: alvo.company_alias,
    })
    await auth.login({
      uid: daVizinha.email,
      password: 'Password123!#',
      company_alias: vizinha.company_alias,
    })

    await repo.suspender({ empresa_id: alvo.id, motivo: 'Cliente em incumprimento' })

    assert.equal(await sessoesVivas(doAlvo), 0)
    assert.equal(await sessoesVivas(daVizinha), 1, 'o inquilino do lado não pode ser afectado')
  })

  test('o portão das rotas de inquilino deixa passar antes e recusa 403 depois', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    await activar(user)

    const antes = await passaNoPortao(user, empresa.company_alias)
    assert.isTrue(antes.passou, 'antes da suspensão o acesso é normal')

    await repo.suspender({ empresa_id: empresa.id, motivo: 'Conta comprometida' })

    const depois = await passaNoPortao(user, empresa.company_alias)
    assert.isFalse(depois.passou, 'nenhuma rota de inquilino pode ser servida')
    assert.equal(depois.status, 403)
  })

  test('o login recusa uma empresa suspensa, com ou sem company_alias no pedido', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    await activar(user)

    await repo.suspender({ empresa_id: empresa.id, motivo: 'Fraude confirmada' })

    const auth = new AuthRepository()

    await assert.rejects(
      () =>
        auth.login({
          uid: user.email,
          password: 'Password123!#',
          company_alias: empresa.company_alias,
        }),
      'Esta empresa está suspensa. Contacte o suporte da plataforma.'
    )

    // Sem `company_alias` — é opcional nesta rota, e uma verificação feita sobre ele
    // seria contornável simplesmente omitindo-o.
    await assert.rejects(
      () => auth.login({ uid: user.email, password: 'Password123!#' }),
      'Esta empresa está suspensa. Contacte o suporte da plataforma.'
    )

    assert.equal(await sessoesVivas(user), 0, 'uma tentativa recusada não deixa token para trás')
  })

  test('reactivar limpa as três colunas e devolve o acesso', async ({ assert }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    await activar(user)

    await repo.suspender({ empresa_id: empresa.id, motivo: 'Verificação de identidade' })
    await repo.reactivar({ empresa_id: empresa.id })

    const recarregada = await Empresa.findOrFail(empresa.id)
    assert.isFalse(recarregada.estaSuspensa)
    assert.isNull(recarregada.suspensa_motivo)
    assert.isNull(recarregada.suspensa_por)

    const { passou } = await passaNoPortao(user, empresa.company_alias)
    assert.isTrue(passou)

    const sessao = await new AuthRepository().login({
      uid: user.email,
      password: 'Password123!#',
      company_alias: empresa.company_alias,
    })
    assert.equal(sessao.type, 'bearer')
  })

  test('suspender duas vezes não reescreve a suspensão original, mas revoga na mesma', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    await activar(user)

    await repo.suspender({ empresa_id: empresa.id, motivo: 'Motivo original' })
    const primeira = await Empresa.findOrFail(empresa.id)

    // Uma sessão que aparecesse depois da suspensão (emitida por um caminho que ainda
    // não verifique, ou por uma corrida) tem de morrer no segundo clique.
    await db.table('auth_access_tokens').insert({
      tokenable_id: user.id,
      type: 'auth_token',
      hash: 'sessao-fantasma',
      abilities: JSON.stringify(['*']),
      created_at: new Date(),
      updated_at: new Date(),
    })
    assert.equal(await sessoesVivas(user), 1)

    await repo.suspender({ empresa_id: empresa.id, motivo: 'Motivo diferente' })

    const segunda = await Empresa.findOrFail(empresa.id)
    assert.equal(
      segunda.suspensa_motivo,
      'Motivo original',
      'a suspensão original é o registo que conta'
    )
    assert.equal(segunda.suspensa_em?.toMillis(), primeira.suspensa_em?.toMillis())
    assert.equal(await sessoesVivas(user), 0)
  })

  test('reactivar uma empresa que não está suspensa não faz nada', async ({ assert }) => {
    const empresa = await createEmpresa()

    const resultado = await repo.reactivar({ empresa_id: empresa.id })

    assert.isFalse(resultado.estaSuspensa)
    assert.isNull((await Empresa.findOrFail(empresa.id)).suspensa_em)
  })

  test('um administrador não suspende a empresa a que pertence', async ({ assert }) => {
    const empresa = await createEmpresa()
    const admin = await createUser(empresa)
    await giveRoleToUser(admin, 'Platform_Admin', undefined, { escopo: ESCOPO_PAPEL.plataforma })

    await assert.rejects(
      () => repo.suspender({ empresa_id: empresa.id, motivo: 'Engano meu', actor_id: admin.id }),
      'Não pode suspender a empresa a que pertence — ficaria sem acesso e sem forma de reverter.'
    )

    assert.isFalse((await Empresa.findOrFail(empresa.id)).estaSuspensa)
  })

  test('a base de dados recusa uma suspensão sem motivo', async ({ assert }) => {
    const empresa = await createEmpresa()

    // O invariante não depende de nenhum caminho de código o respeitar: uma suspensão
    // muda é uma que ninguém consegue explicar nem reverter com confiança.
    await assert.rejects(() =>
      db.from('empresa').where('id', empresa.id).update({ suspensa_em: new Date() })
    )

    assert.isFalse((await Empresa.findOrFail(empresa.id)).estaSuspensa)
  })

  test('o catálogo público deixa de mostrar os produtos de uma empresa suspensa', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const produto = await createProduto(empresa)
    await createLote(produto)

    const antes = await paginateCatalogoProdutos(1, 200)
    assert.isTrue(
      antes.all().some((p: any) => p.id === produto.id),
      'antes da suspensão o produto está na montra pública'
    )

    await repo.suspender({ empresa_id: empresa.id, motivo: 'Montra a anunciar fraude' })

    const depois = await paginateCatalogoProdutos(1, 200)
    assert.isFalse(
      depois.all().some((p: any) => p.id === produto.id),
      'uma empresa suspensa não continua a ser anunciada'
    )
  })
})
