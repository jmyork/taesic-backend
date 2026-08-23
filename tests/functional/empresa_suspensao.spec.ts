import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AuthRepository from '#repositories/auth_repository'
import ValidateCompanyAliasMiddleware from '#middleware/validate_company_alias_middleware'
import Empresa from '#models/empresa'
import User from '#models/user'
import VerificationTokenHash from '#models/verification_token_hash'
import { paginateCatalogoProdutos } from '../../app/helpers/catalogo_produtos_query.js'
import { createEmpresa, createUser, createProduto, createLote } from '../helpers/fixtures.js'

/**
 * A APLICAÇÃO da suspensão de uma empresa — o que este backend faz quando encontra
 * uma empresa suspensa.
 *
 * A ACÇÃO de suspender (a rota, o motivo obrigatório, a revogação das sessões, a
 * trava de não suspender a própria empresa) mudou-se para `taesic-backoffice-api`,
 * onde vivem os endpoints de plataforma. Aqui fica o que corta o acesso ao
 * inquilino — que é onde o inquilino vive. Os dois backends lêem e escrevem a mesma
 * coluna `empresa.suspensa_em` na mesma base de dados.
 *
 * Por isso os testes abaixo suspendem por **escrita directa**, e não pelo
 * repositório: é exactamente o que o outro backend faz do lado de lá, e testar a
 * aplicação através de uma acção que já não vive aqui seria testar código ausente.
 */
test.group('empresa — aplicação da suspensão', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** O que o backoffice grava. `new Date()` e não `DateTime.toSQL()`: o offset do
   *  luxon faz o MySQL recusar com "Incorrect datetime value" (ver 7.11). */
  async function suspender(empresa: Empresa, motivo = 'Suspeita de fraude') {
    await db
      .from('empresa')
      .where('id', empresa.id)
      .update({ suspensa_em: new Date(), suspensa_motivo: motivo })
  }

  async function reactivar(empresa: Empresa) {
    await db
      .from('empresa')
      .where('id', empresa.id)
      .update({ suspensa_em: null, suspensa_motivo: null, suspensa_por: null })
  }

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

  test('o portão das rotas de inquilino deixa passar antes e recusa 403 depois', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    await activar(user)

    const antes = await passaNoPortao(user, empresa.company_alias)
    assert.isTrue(antes.passou, 'antes da suspensão o acesso é normal')

    await suspender(empresa)

    // Este é o ponto que torna a suspensão real: um único portão cobre TODAS as
    // rotas `api/:company_alias/...` — vender, facturar, gerir stock, tudo.
    const depois = await passaNoPortao(user, empresa.company_alias)
    assert.isFalse(depois.passou, 'nenhuma rota de inquilino pode ser servida')
    assert.equal(depois.status, 403, '403, não 404: o inquilino tem de saber que foi cortado')
  })

  test('um token vivo deixa de servir para alguma coisa', async ({ assert }) => {
    // O backoffice revoga as sessões ao suspender, mas isso é do outro lado. O que
    // este backend garante é que, mesmo que sobrasse um token, não abre porta nenhuma.
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    await activar(user)

    const sessao = await new AuthRepository().login({
      uid: user.email,
      password: 'Password123!#',
      company_alias: empresa.company_alias,
    })
    assert.equal(sessao.type, 'bearer')

    await suspender(empresa)

    const { passou, status } = await passaNoPortao(user, empresa.company_alias)
    assert.isFalse(passou)
    assert.equal(status, 403)
  })

  test('o login recusa uma empresa suspensa, com ou sem company_alias no pedido', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    await activar(user)

    await suspender(empresa, 'Fraude confirmada')

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

    const tokens = await db
      .from('auth_access_tokens')
      .where('tokenable_id', user.id)
      .count('* as total')
      .first()
    assert.equal(Number(tokens?.total ?? 0), 0, 'uma tentativa recusada não deixa token para trás')
  })

  test('reactivada, a empresa volta a trabalhar', async ({ assert }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    await activar(user)

    await suspender(empresa)
    await reactivar(empresa)

    const { passou } = await passaNoPortao(user, empresa.company_alias)
    assert.isTrue(passou)

    const sessao = await new AuthRepository().login({
      uid: user.email,
      password: 'Password123!#',
      company_alias: empresa.company_alias,
    })
    assert.equal(sessao.type, 'bearer')
  })

  test('uma empresa suspensa não afecta o inquilino do lado', async ({ assert }) => {
    const alvo = await createEmpresa()
    const vizinha = await createEmpresa()
    const doAlvo = await createUser(alvo)
    const daVizinha = await createUser(vizinha)
    await activar(doAlvo)
    await activar(daVizinha)

    await suspender(alvo)

    assert.isFalse((await passaNoPortao(doAlvo, alvo.company_alias)).passou)
    assert.isTrue(
      (await passaNoPortao(daVizinha, vizinha.company_alias)).passou,
      'o corte é de uma empresa, não da plataforma'
    )
  })

  test('a base de dados recusa uma suspensão sem motivo', async ({ assert }) => {
    // O invariante (`empresa_suspensao_chk`) não depende de nenhum caminho de código
    // o respeitar — e isso passou a importar mais agora que quem suspende é OUTRO
    // backend. Uma suspensão muda é uma que ninguém consegue explicar nem reverter.
    const empresa = await createEmpresa()

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

    await suspender(empresa, 'Montra a anunciar fraude')

    const depois = await paginateCatalogoProdutos(1, 200)
    assert.isFalse(
      depois.all().some((p: any) => p.id === produto.id),
      'uma empresa suspensa não continua a ser anunciada'
    )
  })
})
