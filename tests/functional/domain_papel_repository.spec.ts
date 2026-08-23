import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import DomainPapelRepository from '#repositories/domain_papel_repository'
import Papel, { ESCOPO_PAPEL } from '#models/auth/papel'
import papel_permissao from '#models/auth/papel_permissao'
import PapelNomeReservadoException from '#exceptions/papel_nome_reservado_exception'
import SemGestaoDePapeisException from '#exceptions/sem_gestao_de_papeis_exception'
import PermissaoDesconhecidaException from '#exceptions/permissao_desconhecida_exception'
import { userHasPermission } from '../../app/helpers/Utils.js'
import { createEmpresa, createUser } from '../helpers/fixtures.js'

/**
 * "Toda a gestão deve ser feita pela empresa" — este é o recurso que a torna
 * possível. Até aqui só o dono da plataforma mexia em papéis, e mexia nos de
 * todas as empresas ao mesmo tempo, porque eram partilhados.
 *
 * O que estes testes protegem, por ordem de importância:
 *  1. nada atravessa para outra empresa;
 *  2. uma empresa não se consegue trancar fora da sua própria gestão de acessos;
 *  3. o catálogo de permissões continua a ser do código, não do inquilino.
 */
test.group('domain_papel_repository', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** Uma empresa com um Admin a sério — é ele que segura a chave da gestão. */
  async function empresaComAdmin() {
    const empresa = await createEmpresa()
    const admin = await createUser(empresa, ['Admin'])
    return { empresa, admin }
  }

  test('cria um papel novo com as permissões escolhidas', async ({ assert }) => {
    const { empresa } = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    const papel = await repo.create({
      company_alias: empresa.company_alias,
      nome: 'Chefe de Turno',
      descricao: 'Fecha caixa e vê relatórios',
      permissoes: ['domain_caixas.index', 'domain_relatorios.dashboard_executivo'],
    })

    assert.equal(papel.empresa_id, empresa.id)
    assert.equal(papel.escopo, ESCOPO_PAPEL.empresa)

    const ligacoes = await papel_permissao.query().where('papel_id', papel.id)
    assert.lengthOf(ligacoes, 2)
  })

  test('um papel criado por uma empresa é invisível para outra', async ({ assert }) => {
    const a = await empresaComAdmin()
    const b = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    await repo.create({ company_alias: a.empresa.company_alias, nome: 'Chefe de Turno' })

    const listaB = await repo.paginate({ company_alias: b.empresa.company_alias })
    assert.isFalse(
      listaB.all().some((p) => p.nome === 'Chefe de Turno'),
      'o papel da empresa A não pode aparecer na empresa B'
    )
  })

  test('as duas empresas podem ter um papel com o MESMO nome', async ({ assert }) => {
    const a = await empresaComAdmin()
    const b = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    const pa = await repo.create({ company_alias: a.empresa.company_alias, nome: 'Chefe de Turno' })
    const pb = await repo.create({ company_alias: b.empresa.company_alias, nome: 'Chefe de Turno' })

    assert.notEqual(pa.id, pb.id, 'são linhas distintas — era impossível com unicidade global')
  })

  test('não consegue ler nem editar o papel de outra empresa pelo id', async ({ assert }) => {
    const a = await empresaComAdmin()
    const b = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    const daA = await repo.create({ company_alias: a.empresa.company_alias, nome: 'Chefe de Turno' })

    await assert.rejects(() => repo.findOrFail(b.empresa.company_alias, daA.id))
    await assert.rejects(() =>
      repo.update({ company_alias: b.empresa.company_alias, id: daA.id, nome: 'Roubado' })
    )
    await assert.rejects(() =>
      repo.softDelete({ company_alias: b.empresa.company_alias, id: daA.id })
    )
  })

  test('recusa o prefixo reservado Platform_', async ({ assert }) => {
    const { empresa } = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    await assert.rejects(
      () => repo.create({ company_alias: empresa.company_alias, nome: 'Platform_Admin' }),
      PapelNomeReservadoException
    )
  })

  test('recusa uma permissão que não existe, em vez de a ignorar', async ({ assert }) => {
    const { empresa } = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    await assert.rejects(
      () =>
        repo.create({
          company_alias: empresa.company_alias,
          nome: 'Inventado',
          permissoes: ['domain_caixas.index', 'permissao.que.nao.existe'],
        }),
      PermissaoDesconhecidaException
    )
  })

  test('recusa atribuir uma permissão de PLATAFORMA a um papel de empresa', async ({ assert }) => {
    const { empresa } = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    // `platform_papel.store` existe no catálogo, mas governa o backoffice.
    await assert.rejects(
      () =>
        repo.create({
          company_alias: empresa.company_alias,
          nome: 'Ambicioso',
          permissoes: ['platform_papel.store'],
        }),
      PermissaoDesconhecidaException
    )
  })

  test('editar as permissões de um papel muda o acesso de quem o tem', async ({ assert }) => {
    const { empresa } = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    const papel = await repo.create({
      company_alias: empresa.company_alias,
      nome: 'Chefe de Turno',
      permissoes: ['domain_caixas.index'],
    })

    const funcionario = await createUser(empresa)
    await (await import('#models/auth/user_papel')).default.create({
      user_id: funcionario.id,
      papel_id: papel.id,
    })

    assert.isTrue(await userHasPermission(funcionario, 'domain_caixas.index'))
    assert.isFalse(await userHasPermission(funcionario, 'domain_vendas.index'))

    await repo.update({
      company_alias: empresa.company_alias,
      id: papel.id,
      permissoes: ['domain_vendas.index'],
    })

    assert.isFalse(
      await userHasPermission(funcionario, 'domain_caixas.index'),
      'a permissão retirada tem de deixar de valer'
    )
    assert.isTrue(await userHasPermission(funcionario, 'domain_vendas.index'))
  })

  test('renomear sem indicar permissões não mexe no acesso', async ({ assert }) => {
    const { empresa } = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    const papel = await repo.create({
      company_alias: empresa.company_alias,
      nome: 'Chefe de Turno',
      permissoes: ['domain_caixas.index'],
    })

    await repo.update({
      company_alias: empresa.company_alias,
      id: papel.id,
      nome: 'Coordenador',
    })

    const ligacoes = await papel_permissao.query().where('papel_id', papel.id)
    assert.lengthOf(ligacoes, 1, 'as permissões ficam como estavam')
  })

  test('a empresa NÃO se consegue trancar fora da sua gestão de papéis', async ({ assert }) => {
    // O footgun óbvio de delegar isto: o Admin tira a si próprio a permissão de
    // gerir papéis e ninguém na empresa a consegue repor.
    const { empresa } = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    const admin = await Papel.query()
      .where('empresa_id', empresa.id)
      .where('nome', 'Admin')
      .firstOrFail()

    await assert.rejects(
      () =>
        repo.update({
          company_alias: empresa.company_alias,
          id: admin.id,
          permissoes: ['domain_caixas.index'], // sem domain_papel.update
        }),
      SemGestaoDePapeisException
    )

    // E a transacção reverteu: o Admin continua com tudo o que tinha.
    assert.isTrue(
      await userHasPermission(
        await createUser(empresa, ['Admin']),
        'domain_papel.update'
      ),
      'nada pode ter sido gravado'
    )
  })

  test('apagar o único papel que gere papéis também é recusado', async ({ assert }) => {
    const { empresa } = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    const admin = await Papel.query()
      .where('empresa_id', empresa.id)
      .where('nome', 'Admin')
      .firstOrFail()

    await assert.rejects(
      () => repo.softDelete({ company_alias: empresa.company_alias, id: admin.id }),
      SemGestaoDePapeisException
    )
  })

  test('apagar o Admin é possível quando OUTRO papel já assegura a gestão', async ({ assert }) => {
    // A regra é "não ficar sem gestão", não "o Admin é intocável" — uma empresa
    // que organize os seus papéis de outra maneira não pode ficar presa.
    const { empresa } = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    const substituto = await repo.create({
      company_alias: empresa.company_alias,
      nome: 'Gestor de Acessos',
      permissoes: ['domain_papel.index', 'domain_papel.update'],
    })

    const outro = await createUser(empresa)
    await (await import('#models/auth/user_papel')).default.create({
      user_id: outro.id,
      papel_id: substituto.id,
    })

    const admin = await Papel.query()
      .where('empresa_id', empresa.id)
      .where('nome', 'Admin')
      .firstOrFail()

    const apagado = await repo.softDelete({ company_alias: empresa.company_alias, id: admin.id })
    assert.isNotNull(apagado.deletedAt)
  })

  test('recriar um papel apagado revive a linha, sem ER_DUP_ENTRY', async ({ assert }) => {
    const { empresa } = await empresaComAdmin()
    const repo = new DomainPapelRepository()

    const papel = await repo.create({ company_alias: empresa.company_alias, nome: 'Temporario' })
    await repo.softDelete({ company_alias: empresa.company_alias, id: papel.id })

    const recriado = await repo.create({
      company_alias: empresa.company_alias,
      nome: 'Temporario',
      descricao: 'de volta',
    })

    assert.equal(recriado.id, papel.id, 'reutiliza a linha — o índice único cobre as apagadas')
    assert.isNull(recriado.deletedAt)
  })

  test('o catálogo de permissões só mostra as de domínio', async ({ assert }) => {
    const repo = new DomainPapelRepository()
    const catalogo = await repo.catalogoDePermissoes()

    assert.isTrue(catalogo.length > 0)
    assert.isTrue(
      catalogo.every((p) => p.nome.startsWith('domain_')),
      'nenhuma permissão de plataforma pode aparecer a um inquilino'
    )
  })
})
