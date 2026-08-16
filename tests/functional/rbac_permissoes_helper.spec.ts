import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Papel from '#models/auth/papel'
import Permissao from '#models/auth/permissao'
import papel_permissao from '#models/auth/papel_permissao'
import { DateTime } from 'luxon'
import {
  concederPermissao,
  ehPapelCritico,
  resolverPermissoes,
  revogarPermissao,
} from '../../app/helpers/rbac_permissoes.js'
import { createEmpresa, createUser } from '../helpers/fixtures.js'
import { userHasPermission } from '../../app/helpers/Utils.js'

/**
 * Motor dos comandos `permissao:conceder` / `permissao:revogar`.
 *
 * Testa-se o helper e não a execução do ace: é onde está toda a decisão (o que conta como
 * leitura, o que fica de fora, o que já existe) e assim corre sem simular uma consola.
 */
test.group('rbac — resolver, conceder e revogar permissões', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('--leitura e --escrita traduzem-se nos sufixos canónicos do recurso', async ({ assert }) => {
    const leitura = await resolverPermissoes(['domain_vendapagamento'], 'leitura')
    assert.deepEqual(
      leitura.permissoes.map((p) => p.nome).sort(),
      ['domain_vendapagamento.index', 'domain_vendapagamento.show']
    )

    const escrita = await resolverPermissoes(['domain_vendapagamento'], 'escrita')
    assert.deepEqual(
      escrita.permissoes.map((p) => p.nome).sort(),
      [
        'domain_vendapagamento.destroy',
        'domain_vendapagamento.store',
        'domain_vendapagamento.update',
      ]
    )
  })

  test('--tudo inclui as acções próprias do recurso', async ({ assert }) => {
    const tudo = await resolverPermissoes(['domain_vendas'], 'tudo')
    const nomes = tudo.permissoes.map((p) => p.nome)

    assert.include(nomes, 'domain_vendas.index')
    assert.include(nomes, 'domain_vendas.store')
    // `anular` é uma acção própria de vendas — só entra com --tudo.
    assert.include(nomes, 'domain_vendas.anular')
  })

  /**
   * O ponto que mais importa acertar: nada no NOME de `.anular`/`.catalogo`/`.meu` diz se
   * lê ou escreve. Adivinhar isso é como se criam buracos de acesso — ficam de fora dos
   * modos e são reportadas a quem corre o comando.
   */
  test('acções próprias ficam FORA de --leitura/--escrita, e são assinaladas', async ({ assert }) => {
    const leitura = await resolverPermissoes(['domain_vendas'], 'leitura')

    assert.deepEqual(
      leitura.permissoes.map((p) => p.nome).sort(),
      ['domain_vendas.index', 'domain_vendas.show']
    )
    assert.include(leitura.foraDoModo, 'domain_vendas.anular')
    assert.notInclude(leitura.permissoes.map((p) => p.nome), 'domain_vendas.anular')
  })

  test('nome exacto continua a funcionar, e o que não existe é reportado', async ({ assert }) => {
    const r = await resolverPermissoes([
      'domain_vendapagamento.store',
      'domain_isto_nao_existe.store',
    ])

    assert.deepEqual(r.permissoes.map((p) => p.nome), ['domain_vendapagamento.store'])
    assert.deepEqual(r.inexistentes, ['domain_isto_nao_existe.store'])
  })

  test('vários recursos de uma vez', async ({ assert }) => {
    const r = await resolverPermissoes(['domain_cupom', 'domain_cliente'], 'leitura')
    const nomes = r.permissoes.map((p) => p.nome)

    assert.include(nomes, 'domain_cupom.index')
    assert.include(nomes, 'domain_cliente.index')
  })

  test('conceder é idempotente e repõe uma associação com soft delete', async ({ assert }) => {
    const papel = await Papel.findByOrFail('nome', 'VendedorVisualizador')
    const permissao = await Permissao.findByOrFail('nome', 'domain_vendapagamento.store')

    assert.equal(await concederPermissao(papel, permissao), 'atribuída')
    assert.equal(await concederPermissao(papel, permissao), 'já tinha')

    // O recurso `papel_permissao` da API faz soft delete — uma linha nesse estado não pode
    // ser dada como "já tinha" (a pessoa não tem), nem duplicada (unique papel+permissão).
    const linha = await papel_permissao
      .query()
      .where('papel_id', papel.id)
      .where('permissao_id', permissao.id)
      .firstOrFail()
    linha.deletedAt = DateTime.now()
    await linha.save()

    assert.equal(await concederPermissao(papel, permissao), 'reposta')
    assert.isNull((await papel_permissao.findOrFail(linha.id)).deletedAt)
  })

  test('revogar tira mesmo o acesso e é idempotente', async ({ assert }) => {
    const empresa = await createEmpresa()
    const vendedor = await createUser(empresa, ['Vendedor'])
    const papel = await Papel.findByOrFail('nome', 'Vendedor')
    const permissao = await Permissao.findByOrFail('nome', 'domain_vendapagamento.store')

    assert.isTrue(await userHasPermission(vendedor, 'domain_vendapagamento.store'))

    assert.equal(await revogarPermissao(papel, permissao), 'removida')
    assert.isFalse(await userHasPermission(vendedor, 'domain_vendapagamento.store'))

    assert.equal(await revogarPermissao(papel, permissao), 'não tinha')

    // E volta a poder ser atribuída (a linha saiu mesmo — a unique não fica a bloquear).
    assert.equal(await concederPermissao(papel, permissao), 'atribuída')
    assert.isTrue(await userHasPermission(vendedor, 'domain_vendapagamento.store'))
  })

  /**
   * Sem o `whereNull('papel_permissao.deleted_at')` em `userHasPermission`, retirar uma
   * permissão pela API (que faz soft delete) não retirava nada: a pessoa continuava a
   * passar no `permission_middleware`.
   */
  test('uma associação com soft delete não dá acesso nenhum', async ({ assert }) => {
    const empresa = await createEmpresa()
    const vendedor = await createUser(empresa, ['Vendedor'])
    const papel = await Papel.findByOrFail('nome', 'Vendedor')
    const permissao = await Permissao.findByOrFail('nome', 'domain_vendas.store')

    const linha = await papel_permissao
      .query()
      .where('papel_id', papel.id)
      .where('permissao_id', permissao.id)
      .firstOrFail()

    linha.deletedAt = DateTime.now()
    await linha.save()

    assert.isFalse(
      await userHasPermission(vendedor, 'domain_vendas.store'),
      'soft delete tem de revogar — senão o destroy da API é decorativo'
    )
  })

  test('revogar não toca noutros papéis nem no catálogo', async ({ assert }) => {
    const empresa = await createEmpresa()
    const admin = await createUser(empresa, ['Admin'])
    const papelVendedor = await Papel.findByOrFail('nome', 'Vendedor')
    const permissao = await Permissao.findByOrFail('nome', 'domain_facturas.store')

    await revogarPermissao(papelVendedor, permissao)

    assert.isTrue(await userHasPermission(admin, 'domain_facturas.store'), 'o Admin mantém-se')
    assert.isNotNull(await Permissao.findBy('nome', 'domain_facturas.store'), 'a permissão continua no catálogo')
  })

  test('Admin e Platform_Admin estão marcados como críticos', async ({ assert }) => {
    assert.isTrue(ehPapelCritico('Admin'))
    assert.isTrue(ehPapelCritico('Platform_Admin'))
    assert.isFalse(ehPapelCritico('Vendedor'))
  })
})
