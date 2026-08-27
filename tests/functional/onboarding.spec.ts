import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import Pos from '#models/faturacao/pos'
import Produtos from '#models/faturacao/produtos'
import ProdutoCategorias from '#models/faturacao/produto_categorias'
import Empresa from '#models/empresa'
import posRepository from '#repositories/pos_repository'
import onboardingRepository from '#repositories/onboarding_repository'
import UltimoPostoException from '#exceptions/ultimo_posto_exception'
import {
  NOME_POSTO_PADRAO,
  contarPostosActivos,
  semearPostoPadrao,
} from '../../app/helpers/posto_padrao.js'
import {
  RAMOS_DE_ACTUACAO,
  ramoPorId,
  semearRamosDeActuacao,
} from '../../app/helpers/ramos_de_actuacao.js'
import { createEmpresa, createPos, createTenant, createUser } from '../helpers/fixtures.js'
import { userHasPermission } from '../../app/helpers/Utils.js'
import { DateTime } from 'luxon'
import User from '#models/user'
import VerificationTokenHash from '#models/verification_token_hash'
import AuthRepository from '#repositories/auth_repository'

/**
 * O complemento de onboarding, em três invariantes:
 *
 * 1. Uma empresa nasce com um posto de atendimento.
 * 2. Nunca fica sem nenhum.
 * 3. Escolher o ramo de actuação semeia o catálogo desse ramo.
 *
 * O primeiro é verificado sobre o registo real em
 * `empresa_registo_operacao.spec.ts` (que corre sem transacção global, de propósito);
 * aqui verifica-se o helper e tudo o que se lhe segue.
 */

test.group('posto de atendimento por omissão', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('semear cria a "Sede" com os dados da empresa', async ({ assert }) => {
    const empresa = await createEmpresa()

    const posto = await semearPostoPadrao(empresa, 'dono@example.com')

    assert.isNotNull(posto)
    assert.equal(posto!.nome, NOME_POSTO_PADRAO)
    assert.equal(posto!.localizacao, empresa.localizacao)
    assert.equal(posto!.contacto, empresa.contacto)
    assert.equal(posto!.email, 'dono@example.com')
    assert.equal(posto!.empresa_id, empresa.id)
  })

  test('é idempotente — uma empresa que já tem posto não ganha outro', async ({ assert }) => {
    const empresa = await createEmpresa()
    await createPos(empresa)

    const segunda = await semearPostoPadrao(empresa, 'dono@example.com')

    assert.isNull(segunda, 'não devia ter criado nada')
    assert.equal(await contarPostosActivos(empresa.id), 1)
  })

  test('escolhe um nome livre quando "Sede" já está ocupado por um posto apagado', async ({
    assert,
  }) => {
    // `pos` tem unique(nome, empresa_id) e um posto soft-apagado continua a ocupar o
    // nome. Sem a procura de nome livre isto rebentava com erro de chave duplicada no
    // meio do registo.
    const empresa = await createEmpresa()
    const antigo = await createPos(empresa, { nome: NOME_POSTO_PADRAO })
    await db.from('pos').where('id', antigo.id).update({ deleted_at: new Date() })

    const posto = await semearPostoPadrao(empresa, 'dono@example.com')

    assert.isNotNull(posto)
    assert.equal(posto!.nome, `${NOME_POSTO_PADRAO} 2`)
  })

  test('contarPostosActivos ignora os postos apagados', async ({ assert }) => {
    const empresa = await createEmpresa()
    await createPos(empresa)
    const segundo = await createPos(empresa)
    await db.from('pos').where('id', segundo.id).update({ deleted_at: new Date() })

    assert.equal(await contarPostosActivos(empresa.id), 1)
  })
})

test.group('a empresa nunca fica sem posto de atendimento', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('desactivar o último posto é recusado', async ({ assert }) => {
    const empresa = await createEmpresa()
    const unico = await createPos(empresa)
    const repo = new posRepository()

    await assert.rejects(
      () => repo.softDelete(unico.id, empresa.company_alias),
      UltimoPostoException.message
    )

    // E continua activo — a recusa não pode deixar o registo meio alterado.
    const depois = await Pos.find(unico.id)
    assert.isNull(depois!.deletedAt)
  })

  test('com dois postos, desactiva-se um; o que sobra já não', async ({ assert }) => {
    const empresa = await createEmpresa()
    const primeiro = await createPos(empresa)
    const segundo = await createPos(empresa)
    const repo = new posRepository()

    await repo.softDelete(primeiro.id, empresa.company_alias)
    assert.equal(await contarPostosActivos(empresa.id), 1)

    await assert.rejects(
      () => repo.softDelete(segundo.id, empresa.company_alias),
      UltimoPostoException.message
    )
  })

  test('reactivar nunca é recusado por esta regra', async ({ assert }) => {
    // O `softDelete` é um alternador. Se a verificação não distinguisse os dois
    // sentidos, um posto apagado ficava impossível de recuperar assim que fosse o
    // único — e é precisamente aí que alguém precisa dele de volta.
    const empresa = await createEmpresa()
    const posto = await createPos(empresa)
    await db.from('pos').where('id', posto.id).update({ deleted_at: new Date() })

    const repo = new posRepository()
    await repo.softDelete(posto.id, empresa.company_alias)

    const depois = await Pos.find(posto.id)
    assert.isNull(depois!.deletedAt, 'devia ter sido reactivado')
  })

  test('a contagem é por empresa — o posto de outra empresa não conta', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const unicoDeA = await createPos(empresaA)
    await createPos(empresaB)

    const repo = new posRepository()

    // Se a contagem fosse global, os dois postos somavam 2 e a empresa A ficaria sem
    // nenhum.
    await assert.rejects(
      () => repo.softDelete(unicoDeA.id, empresaA.company_alias),
      UltimoPostoException.message
    )
  })
})

test.group('semear o ramo de actuação', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('cria as categorias e os produtos do ramo, ligados entre si', async ({ assert }) => {
    const empresa = await createEmpresa()
    const ramo = ramoPorId('farmacia')!

    const resultado = await db.transaction((trx) =>
      semearRamosDeActuacao(empresa.id, ['farmacia'], trx)
    )

    assert.equal(resultado.categorias_criadas, ramo.categorias.length)
    assert.equal(resultado.produtos_criados, ramo.produtos.length)

    const categorias = await ProdutoCategorias.query().where('empresa_id', empresa.id)
    assert.lengthOf(categorias, ramo.categorias.length)

    const criados = await Produtos.query().where('empresa_id', empresa.id).preload('categorias')
    assert.lengthOf(criados, ramo.produtos.length)

    for (const produto of criados) {
      const esperada = ramo.produtos.find((p) => p.nome === produto.nome)!.categoria
      assert.deepEqual(
        produto.categorias.map((c) => c.nome),
        [esperada],
        `${produto.nome} devia estar na categoria ${esperada}`
      )
    }
  })

  test('os produtos nascem sem lote — logo, fora do PDV', async ({ assert }) => {
    // É esta a diferença entre "catálogo por preencher" e "catálogo a 0 Kz pronto a
    // vender". O catálogo de venda exige lote (ver catalogo_produtos_query.ts).
    const empresa = await createEmpresa()

    await db.transaction((trx) => semearRamosDeActuacao(empresa.id, ['supermercado'], trx))

    const comLote = await db
      .from('produtos')
      .join('lote_produto', 'lote_produto.produto_id', 'produtos.id')
      .where('produtos.empresa_id', empresa.id)
      .count('* as total')
      .first()

    assert.equal(Number(comLote.total), 0)
  })

  test('os produtos nascem como físicos e disponíveis', async ({ assert }) => {
    const empresa = await createEmpresa()
    await db.transaction((trx) => semearRamosDeActuacao(empresa.id, ['vestuario'], trx))

    const criados = await Produtos.query().where('empresa_id', empresa.id)
    assert.isNotEmpty(criados)
    for (const p of criados) {
      // `Boolean(...)`: mysql2 devolve TINYINT(1) como 0/1, não como boolean — a mesma
      // normalização que `empresaDoUtilizador` faz à mão em auth_repository.ts.
      assert.isFalse(Boolean(p.is_service), `${p.nome} não devia ser serviço`)
      assert.isTrue(Boolean(p.disponivel))
    }
  })

  test('é idempotente — semear duas vezes não duplica', async ({ assert }) => {
    const empresa = await createEmpresa()

    await db.transaction((trx) => semearRamosDeActuacao(empresa.id, ['restauracao'], trx))
    const segunda = await db.transaction((trx) =>
      semearRamosDeActuacao(empresa.id, ['restauracao'], trx)
    )

    assert.equal(segunda.categorias_criadas, 0)
    assert.equal(segunda.produtos_criados, 0)

    const ramo = ramoPorId('restauracao')!
    const produtos = await Produtos.query().where('empresa_id', empresa.id)
    assert.lengthOf(produtos, ramo.produtos.length)
  })

  test('trocar de ramo acrescenta, nunca apaga o catálogo anterior', async ({ assert }) => {
    const empresa = await createEmpresa()

    await db.transaction((trx) => semearRamosDeActuacao(empresa.id, ['farmacia'], trx))
    await db.transaction((trx) => semearRamosDeActuacao(empresa.id, ['vestuario'], trx))

    const nomes = (await Produtos.query().where('empresa_id', empresa.id)).map((p) => p.nome)

    assert.include(nomes, 'Paracetamol 500 mg', 'o catálogo do primeiro ramo devia manter-se')
    assert.include(nomes, 'T-shirt')
  })

  test('"Serviços" e "Imóveis" semeiam só categorias', async ({ assert }) => {
    // Um serviço sem lote não tem preço, e inventar-lhe um é o que este desenho recusa.
    // Ver o cabeçalho de ramos_de_actuacao.ts.
    for (const id of ['servicos', 'imobiliaria']) {
      const empresa = await createEmpresa()
      const resultado = await db.transaction((trx) => semearRamosDeActuacao(empresa.id, [id], trx))

      assert.isAbove(resultado.categorias_criadas, 0, `${id} devia semear categorias`)
      assert.equal(resultado.produtos_criados, 0, `${id} não devia semear produtos`)
    }
  })

  test('"personalizar do zero" não semeia nada', async ({ assert }) => {
    const empresa = await createEmpresa()

    const resultado = await db.transaction((trx) =>
      semearRamosDeActuacao(empresa.id, ['personalizado'], trx)
    )

    assert.equal(resultado.categorias_criadas, 0)
    assert.equal(resultado.produtos_criados, 0)
    assert.lengthOf(await ProdutoCategorias.query().where('empresa_id', empresa.id), 0)
  })

  test('um ramo desconhecido é recusado', async ({ assert }) => {
    const empresa = await createEmpresa()

    await assert.rejects(() =>
      db.transaction((trx) => semearRamosDeActuacao(empresa.id, ['nao-existe'], trx))
    )
  })

  test('semear numa empresa não toca no catálogo de outra', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()

    await db.transaction((trx) => semearRamosDeActuacao(empresaA.id, ['farmacia'], trx))

    assert.lengthOf(await Produtos.query().where('empresa_id', empresaB.id), 0)
    assert.lengthOf(await ProdutoCategorias.query().where('empresa_id', empresaB.id), 0)
  })

  test('os números de produto continuam sequenciais por empresa', async ({ assert }) => {
    // `produtos` tem unique(empresa_id, numero) — semear dezenas de uma vez com o mesmo
    // número seria recusado pela base de dados.
    const empresa = await createEmpresa()
    const ramo = ramoPorId('supermercado')!

    await db.transaction((trx) => semearRamosDeActuacao(empresa.id, ['supermercado'], trx))

    const numeros = (await Produtos.query().where('empresa_id', empresa.id))
      .map((p) => p.numero)
      .sort((a, b) => a - b)

    // Derivado do catálogo, não escrito à mão: acrescentar um produto ao ramo não pode
    // partir este teste — o que ele guarda é a sequência, não o tamanho do catálogo.
    assert.deepEqual(
      numeros,
      Array.from({ length: ramo.produtos.length }, (_, i) => i + 1)
    )
  })
})

test.group('estado e conclusão do onboarding', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('uma empresa nova está por onboardar e traz o catálogo de ramos', async ({ assert }) => {
    const empresa = await createEmpresa()
    const repo = new onboardingRepository()

    const estado = await repo.estado(empresa.company_alias)

    assert.isFalse(estado.concluido)
    assert.isNull(estado.concluido_em)
    assert.isNull(estado.ramo_actuacao)
    assert.isNotEmpty(estado.ramos)
    assert.isTrue(
      estado.ramos.some((r) => r.id === 'farmacia'),
      'o catálogo devia incluir os ramos conhecidos'
    )
  })

  test('aplicar o ramo grava a escolha e semeia numa só operação', async ({ assert }) => {
    const empresa = await createEmpresa()
    const repo = new onboardingRepository()

    const resultado = await repo.aplicarRamos({
      company_alias: empresa.company_alias,
      ramos: ['farmacia'],
    })

    assert.deepEqual(resultado.ramos, ['farmacia'])
    assert.isAbove(resultado.produtos_criados, 0)

    const estado = await repo.estado(empresa.company_alias)
    assert.equal(estado.ramo_actuacao, 'farmacia')
    assert.equal(estado.total_produtos, resultado.produtos_criados)
    assert.equal(estado.total_categorias, resultado.categorias_criadas)
  })

  test('concluir marca a data, e repetir não a muda', async ({ assert }) => {
    const empresa = await createEmpresa()
    await createPos(empresa)
    const repo = new onboardingRepository()

    const primeira = await repo.concluir({ company_alias: empresa.company_alias })
    assert.isTrue(primeira.onboardingConcluido)

    // Comparado sobre o que ficou GRAVADO, nas duas passagens: o modelo devolvido pela
    // primeira chamada traz a data com milissegundos (foi posta em memória), e a coluna
    // é TIMESTAMP — guarda só até ao segundo. Comparar um com o outro falharia por causa
    // da precisão e não por a data ter mudado, que é o que este teste quer saber.
    const depoisDaPrimeira = await Empresa.findOrFail(empresa.id)
    const data = depoisDaPrimeira.onboarding_concluido_em!.toISO()

    await repo.concluir({ company_alias: empresa.company_alias })

    const depoisDaSegunda = await Empresa.findOrFail(empresa.id)
    assert.equal(depoisDaSegunda.onboarding_concluido_em!.toISO(), data)
  })

  test('concluir cria o posto em falta numa empresa anterior a esta mudança', async ({
    assert,
  }) => {
    // As empresas registadas antes de `semearPostoPadrao` existir podem não ter posto
    // nenhum. Deixá-las sair do onboarding assim era mandá-las para um painel onde não
    // se abre caixa nem se vende.
    const empresa = await createEmpresa()
    const dono = await createUser(empresa)
    empresa.user_id = dono.id
    await empresa.save()

    assert.equal(await contarPostosActivos(empresa.id), 0)

    await new onboardingRepository().concluir({ company_alias: empresa.company_alias })

    assert.equal(await contarPostosActivos(empresa.id), 1)
  })

  test('o estado é o da empresa pedida, não o de outra', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const repo = new onboardingRepository()

    await repo.aplicarRamos({ company_alias: empresaA.company_alias, ramos: ['vestuario'] })

    const estadoB = await repo.estado(empresaB.company_alias)
    assert.isNull(estadoB.ramo_actuacao)
    assert.equal(estadoB.total_produtos, 0)

    const recarregadaB = await Empresa.findOrFail(empresaB.id)
    assert.isNull(recarregadaB.ramo_actuacao)
  })
})

/**
 * A rede que faltou três vezes neste projecto.
 *
 * O catálogo de permissões é uma lista mantida à mão em `database_seeder.ts`, e já ficou
 * para trás em 7.6 (Gerente/Supervisor sem nada), 7.8 (`domain_pos.meu`) e 7.12 — esta
 * última deixou os vendedores sem conseguir fechar uma única venda. Um passo NOVO num
 * fluxo obrigatório é exactamente a forma como isso acontece, e o onboarding é um passo
 * novo num fluxo obrigatório.
 *
 * Se este teste falhar depois de um `db:fresh:seed`, o que falta é correr
 * `node ace permissao:conceder <permissao> <papel> --todas-empresas` — ver a secção 7.13.
 */
const FLUXO_DE_ONBOARDING = [
  { passo: 'ver o estado da configuração inicial', rota: 'domain_onboarding.estado' },
  { passo: 'listar os ramos de actuação', rota: 'domain_onboarding.ramos' },
  { passo: 'escolher o ramo e semear o catálogo', rota: 'domain_onboarding.ramo' },
  { passo: 'concluir a configuração inicial', rota: 'domain_onboarding.concluir' },
]

test.group('RBAC — quem regista a empresa consegue configurá-la', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('o Admin tem todas as permissões do onboarding', async ({ assert }) => {
    const { empresa } = await createTenant()
    const admin = await createUser(empresa, ['Admin'])

    const emFalta: string[] = []
    for (const { passo, rota } of FLUXO_DE_ONBOARDING) {
      if (!(await userHasPermission(admin, rota))) emFalta.push(`${rota} (${passo})`)
    }

    assert.deepEqual(
      emFalta,
      [],
      `o Admin não consegue concluir o onboarding — falta-lhe: ${emFalta.join(', ')}`
    )
  })

  test('o Gerente vê o estado mas não configura', async ({ assert }) => {
    // A configuração inicial é do dono da empresa. O Gerente lê (o ecrã de definições
    // mostra o ramo escolhido) e não semeia catálogo nem fecha o passo.
    const { empresa } = await createTenant()
    const gerente = await createUser(empresa, ['Gerente'])

    assert.isTrue(await userHasPermission(gerente, 'domain_onboarding.estado'))
    assert.isTrue(await userHasPermission(gerente, 'domain_onboarding.ramos'))
    assert.isFalse(await userHasPermission(gerente, 'domain_onboarding.ramo'))
    assert.isFalse(await userHasPermission(gerente, 'domain_onboarding.concluir'))
  })

  test('um Vendedor não toca na configuração da empresa', async ({ assert }) => {
    const { empresa } = await createTenant()
    const vendedor = await createUser(empresa, ['Vendedor'])

    for (const { rota } of FLUXO_DE_ONBOARDING) {
      assert.isFalse(await userHasPermission(vendedor, rota), `${rota} não devia ser do Vendedor`)
    }
  })
})

/**
 * O sinalizador que faz o onboarding correr, ou nunca correr.
 *
 * Esta é a peça que estava em falta: o `ProtectedRoute` do frontend decide por
 * `onboarding_completed === false`, e nenhuma rota deste backend alguma vez devolveu esse
 * campo. `undefined` não é `false` — toda a gente caía directamente no painel, com o
 * catálogo vazio, e os sete passos do ecrã de onboarding nunca chegaram a ser vistos.
 *
 * Testado sobre `login()` porque é lá que a decisão de encaminhamento é tomada, não sobre
 * a coluna: uma coluna correcta que o login não devolva volta a dar exactamente o mesmo
 * sintoma, e foi assim que este bug sobreviveu até aqui.
 */
test.group('o login diz se a empresa ainda está por configurar', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

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

  async function entrar(empresa: Empresa) {
    const user = await createUser(empresa)
    await activar(user)
    return new AuthRepository().login({
      uid: user.email,
      password: 'Password123!#',
      company_alias: empresa.company_alias,
    })
  }

  test('uma empresa por configurar entra com onboarding_completed a false', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()

    const sessao = await entrar(empresa)

    assert.isFalse(sessao.onboarding_completed)
    assert.isNull(sessao.ramo_actuacao)
  })

  test('depois de concluir, o login deixa de a mandar para o onboarding', async ({ assert }) => {
    const empresa = await createEmpresa()
    await createPos(empresa)
    const repo = new onboardingRepository()

    await repo.aplicarRamos({ company_alias: empresa.company_alias, ramos: ['restauracao'] })
    await repo.concluir({ company_alias: empresa.company_alias })

    const sessao = await entrar(empresa)

    assert.isTrue(sessao.onboarding_completed)
    assert.equal(sessao.ramo_actuacao, 'restauracao')
  })
})

test.group('vários ramos de actuação', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('semeia a união dos catálogos, sem repetir o que é comum', async ({ assert }) => {
    // "Protector solar FPS 50" está em Farmácia E em Perfumaria. `produtos` não tem
    // unicidade por nome, portanto sem a deduplicação ficavam duas linhas iguais no
    // catálogo do dono.
    const empresa = await createEmpresa()
    const farmacia = ramoPorId('farmacia')!
    const cosmetica = ramoPorId('cosmetica')!

    const nomesEsperados = new Set(
      [...farmacia.produtos, ...cosmetica.produtos].map((p) => p.nome)
    )

    const resultado = await db.transaction((trx) =>
      semearRamosDeActuacao(empresa.id, ['farmacia', 'cosmetica'], trx)
    )

    assert.equal(resultado.produtos_criados, nomesEsperados.size)

    const nomes = (await Produtos.query().where('empresa_id', empresa.id)).map((p) => p.nome)
    assert.lengthOf(nomes, nomesEsperados.size)
    assert.lengthOf(new Set(nomes), nomes.length, 'não devia haver nomes repetidos')
  })

  test('aplicar grava o conjunto e elege o primeiro como principal', async ({ assert }) => {
    const empresa = await createEmpresa()
    const repo = new onboardingRepository()

    await repo.aplicarRamos({
      company_alias: empresa.company_alias,
      ramos: ['padaria', 'restauracao'],
    })

    const estado = await repo.estado(empresa.company_alias)
    assert.deepEqual(estado.ramos_actuacao, ['padaria', 'restauracao'])
    assert.equal(estado.ramo_actuacao, 'padaria')
  })

  test('o conjunto é substituído, não acrescentado', async ({ assert }) => {
    // Desmarcar um cartão tem de o desmarcar mesmo — senão a grelha de escolha múltipla
    // acumula escolhas antigas que o utilizador julga ter tirado.
    const empresa = await createEmpresa()
    const repo = new onboardingRepository()

    await repo.aplicarRamos({ company_alias: empresa.company_alias, ramos: ['farmacia', 'padaria'] })
    await repo.aplicarRamos({ company_alias: empresa.company_alias, ramos: ['padaria'] })

    const estado = await repo.estado(empresa.company_alias)
    assert.deepEqual(estado.ramos_actuacao, ['padaria'])
    assert.equal(estado.ramo_actuacao, 'padaria')
  })

  test('desmarcar um ramo não apaga o que ele semeou', async ({ assert }) => {
    // O dono pode já ter posto preço ou vendido. Apagar-lhe catálogo por ter desmarcado
    // um cartão num ecrã de configuração seria destruir trabalho dele.
    const empresa = await createEmpresa()
    const repo = new onboardingRepository()

    await repo.aplicarRamos({ company_alias: empresa.company_alias, ramos: ['farmacia'] })
    await repo.aplicarRamos({ company_alias: empresa.company_alias, ramos: ['padaria'] })

    const nomes = (await Produtos.query().where('empresa_id', empresa.id)).map((p) => p.nome)
    assert.include(nomes, 'Paracetamol 500 mg', 'o catálogo da farmácia devia manter-se')
    assert.include(nomes, 'Croissant')
  })

  test('"começar do zero" é exclusivo: cede a qualquer ramo a sério', async ({ assert }) => {
    const empresa = await createEmpresa()
    const repo = new onboardingRepository()

    await repo.aplicarRamos({
      company_alias: empresa.company_alias,
      ramos: ['personalizado', 'padaria'],
    })

    const estado = await repo.estado(empresa.company_alias)
    assert.deepEqual(estado.ramos_actuacao, ['padaria'])
  })

  test('"começar do zero" sozinho continua a valer, e não semeia nada', async ({ assert }) => {
    const empresa = await createEmpresa()
    const repo = new onboardingRepository()

    await repo.aplicarRamos({ company_alias: empresa.company_alias, ramos: ['personalizado'] })

    const estado = await repo.estado(empresa.company_alias)
    assert.deepEqual(estado.ramos_actuacao, ['personalizado'])
    assert.equal(estado.total_produtos, 0)
    assert.equal(estado.total_categorias, 0)
  })

  test('repetir o mesmo ramo na lista não cria linhas repetidas', async ({ assert }) => {
    const empresa = await createEmpresa()
    const repo = new onboardingRepository()

    await repo.aplicarRamos({
      company_alias: empresa.company_alias,
      ramos: ['padaria', 'padaria'],
    })

    const estado = await repo.estado(empresa.company_alias)
    assert.deepEqual(estado.ramos_actuacao, ['padaria'])
  })

  test('os ramos de uma empresa não aparecem noutra', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const repo = new onboardingRepository()

    await repo.aplicarRamos({ company_alias: empresaA.company_alias, ramos: ['farmacia', 'padaria'] })

    const estadoB = await repo.estado(empresaB.company_alias)
    assert.deepEqual(estadoB.ramos_actuacao, [])
    assert.isNull(estadoB.ramo_actuacao)
  })

  test('cada ramo do catálogo semeia sem rebentar', async ({ assert }) => {
    // Rede barata contra um erro de dados neste catálogo: uma categoria escrita num
    // produto mas ausente da lista `categorias` do ramo, um nome repetido, um ramo novo
    // acrescentado à pressa. Sem isto, só se descobre quando um cliente o escolhe.
    for (const ramo of RAMOS_DE_ACTUACAO) {
      const empresa = await createEmpresa()
      const resultado = await db.transaction((trx) =>
        semearRamosDeActuacao(empresa.id, [ramo.id], trx)
      )

      assert.equal(
        resultado.produtos_criados,
        ramo.produtos.length,
        `${ramo.id} devia semear todos os seus produtos`
      )

      // Todo o produto do catálogo aponta para uma categoria que o ramo declara — senão
      // ficaria criado sem categoria nenhuma, em silêncio.
      const semCategoria = await db
        .from('produtos')
        .leftJoin('categorias_produtos', 'categorias_produtos.produto_id', 'produtos.id')
        .where('produtos.empresa_id', empresa.id)
        .whereNull('categorias_produtos.id')
        .count('* as total')
        .first()

      assert.equal(Number(semCategoria.total), 0, `${ramo.id} tem produtos sem categoria`)
    }
  }).timeout(60000)
})
