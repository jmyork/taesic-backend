import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Plano from '#models/plano'
import Subscricao from '#models/subscricao'
import Empresa from '#models/empresa'
import posRepository from '#repositories/pos_repository'
import produtosRepository from '#repositories/produtos_repository'
import authRepository from '#repositories/auth_repository'
import VendasRepository from '#repositories/vendas_repository'
import assinaturaRepository from '#repositories/assinatura_repository'
import LimiteDoPlanoException from '#exceptions/limite_do_plano_exception'
import {
  assertPodeCriarPosto,
  assertPodeFacturar,
  faturacaoDoMes,
  planoDaEmpresa,
  usoDoPlano,
} from '../../app/helpers/limites_do_plano.js'
import { SLUG_PLANO_GRATUITO, semearPlanosPadrao } from '../../app/helpers/planos_padrao.js'
import { userHasPermission } from '../../app/helpers/Utils.js'
import {
  createTenant,
  createEmpresa,
  createUser,
  createPos,
  createProduto,
  createLote,
  createCaixa,
  createVenda,
  createVendaItem,
  pagarVenda,
} from '../helpers/fixtures.js'

/**
 * Os planos passam a ter diferenças que o sistema conhece.
 *
 * Até aqui escolher um plano não mudava nada: o ecrã prometia "Até 3 utilizadores" e o
 * backend nunca olhava para isso. Estes testes são o que impede a promessa de voltar a
 * ser só texto.
 *
 * As duas regras que atravessam tudo (ver `limites_do_plano.ts`):
 *   1. sem plano, sem limite — um erro de configuração nunca tranca uma loja;
 *   2. `null` é ilimitado, nunca zero.
 */

/** Um plano feito à medida do teste, e a subscrição que o liga à empresa. */
async function darPlano(
  empresa: Empresa,
  limites: Partial<{
    limite_utilizadores: number | null
    limite_postos: number | null
    limite_produtos: number | null
    limite_faturacao_mensal: number | null
  }>,
  opcoes: { dataFim?: Date | null } = {}
) {
  const plano = await Plano.create({
    slug: `teste-${Math.random().toString(36).slice(2, 10)}`,
    nome: 'Plano de Teste',
    descricao: 'Só para este teste',
    preco: 1000,
    moeda: 'AOA',
    periodo: 'mensal',
    ativo: true,
    dias_gratuitos: 0,
    ordem: 99,
    funcionalidades: [],
    limite_utilizadores: null,
    limite_postos: null,
    limite_produtos: null,
    limite_faturacao_mensal: null,
    ...limites,
  } as any)

  await Subscricao.create({
    cliente_id: empresa.id,
    plano_id: plano.id,
    status: 'ATIVA',
    data_inicio: new Date(),
    data_fim: (opcoes.dataFim ?? null) as unknown as Date,
    renova: true,
  })

  return plano
}

test.group('limites do plano — contagens', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sem plano nenhum, nada é bloqueado', async ({ assert }) => {
    // Regra 1. Um erro de configuração da plataforma não pode transformar-se numa loja
    // que deixa de poder trabalhar.
    const empresa = await createEmpresa()
    await createPos(empresa)
    await createPos(empresa)

    assert.isNull(await planoDaEmpresa(empresa.id))
    // Não lança.
    await assertPodeCriarPosto(empresa.id)
  })

  test('o limite de postos é imposto na criação', async ({ assert }) => {
    const empresa = await createEmpresa()
    await darPlano(empresa, { limite_postos: 1 })

    const repo = new posRepository()
    await repo.create({
      nome: 'Primeiro',
      email: 'p1@example.com',
      contacto: '900000001',
      localizacao: 'Luanda',
      company_alias: empresa.company_alias,
    })

    await assert.rejects(
      () =>
        repo.create({
          nome: 'Segundo',
          email: 'p2@example.com',
          contacto: '900000002',
          localizacao: 'Luanda',
          company_alias: empresa.company_alias,
        }),
      LimiteDoPlanoException
    )
  })

  test('a mensagem diz o limite, o uso e o que fazer', async ({ assert }) => {
    // Uma recusa que não explica é um bug de produto: o utilizador fica a saber que não
    // pode e não fica a saber porquê nem como resolver.
    const empresa = await createEmpresa()
    await darPlano(empresa, { limite_postos: 1 })
    await createPos(empresa)

    try {
      await assertPodeCriarPosto(empresa.id)
      assert.fail('devia ter sido recusado')
    } catch (erro: any) {
      assert.instanceOf(erro, LimiteDoPlanoException)
      assert.include(erro.message, 'Plano de Teste')
      assert.include(erro.message, '1 posto de atendimento')
      assert.include(erro.message, 'Actualize o plano')
    }
  })

  test('`null` é ilimitado, não zero', async ({ assert }) => {
    const empresa = await createEmpresa()
    await darPlano(empresa, { limite_postos: null })

    for (let i = 0; i < 3; i++) await createPos(empresa)

    await assertPodeCriarPosto(empresa.id) // não lança
    assert.isNull((await usoDoPlano(empresa.id)).postos.limite)
  })

  test('o limite de produtos é imposto na criação', async ({ assert }) => {
    const empresa = await createEmpresa()
    await darPlano(empresa, { limite_produtos: 1 })
    await createProduto(empresa)

    const repo = new produtosRepository()
    await assert.rejects(
      () =>
        repo.create({
          nome: 'Produto a mais',
          descricao: 'x',
          is_service: false,
          company_alias: empresa.company_alias,
        } as any),
      LimiteDoPlanoException
    )
  })

  test('o limite de utilizadores é imposto no registo de funcionário', async ({ assert }) => {
    const { empresa } = await createTenant()
    // `createTenant` já criou o Admin, portanto o limite de 1 está gasto.
    await darPlano(empresa, { limite_utilizadores: 1 })

    const repo = new authRepository()
    await assert.rejects(
      () =>
        repo.create({
          username: `novo-${Date.now()}`,
          email: `novo-${Date.now()}@example.com`,
          company_alias: empresa.company_alias,
          papel: ['Vendedor'],
        } as any),
      LimiteDoPlanoException
    )
  })

  test('o plano de uma empresa não limita outra', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    await darPlano(empresaA, { limite_postos: 1 })
    await createPos(empresaA)
    await createPos(empresaB)
    await createPos(empresaB)

    await assert.rejects(() => assertPodeCriarPosto(empresaA.id), LimiteDoPlanoException)
    await assertPodeCriarPosto(empresaB.id) // não lança
  })

  test('uma subscrição expirada deixa de impor limites', async ({ assert }) => {
    // Regra 1 outra vez, e é deliberado: cortar o acesso a quem deixou de pagar é uma
    // decisão de cobrança, com aviso e prazo, tomada pelo backoffice ao suspender a
    // empresa (7.15) — não um efeito colateral de uma data passar.
    const empresa = await createEmpresa()
    await darPlano(
      empresa,
      { limite_postos: 1 },
      { dataFim: DateTime.now().minus({ days: 1 }).toJSDate() }
    )
    await createPos(empresa)

    assert.isNull(await planoDaEmpresa(empresa.id))
    await assertPodeCriarPosto(empresa.id) // não lança
  })
})

test.group('limites do plano — tecto de facturação', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('uma venda dentro do tecto passa', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    await darPlano(empresa, { limite_faturacao_mensal: 10_000 })

    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10 })
    const caixa = await createCaixa(user, pos, { valor_inicial: 0 })
    const venda = await createVenda(caixa)
    await createVendaItem(venda, lote, { quantidade: 1, preco_unitario: 1000 })
    await pagarVenda(venda, 1000)

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    assert.equal(await faturacaoDoMes(empresa.id), 1000)
  })

  test('a venda que ultrapassa o tecto é recusada, e nada fica gravado a meio', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    await darPlano(empresa, { limite_faturacao_mensal: 1_500 })

    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10 })
    const caixa = await createCaixa(user, pos, { valor_inicial: 0 })
    const repo = new VendasRepository()

    const primeira = await createVenda(caixa)
    await createVendaItem(primeira, lote, { quantidade: 1, preco_unitario: 1000 })
    await pagarVenda(primeira, 1000)
    await repo.close({ id: primeira.id, user_id: user.id, company_alias: empresa.company_alias })

    const segunda = await createVenda(caixa)
    await createVendaItem(segunda, lote, { quantidade: 1, preco_unitario: 1000 })
    await pagarVenda(segunda, 1000)

    await assert.rejects(
      () => repo.close({ id: segunda.id, user_id: user.id, company_alias: empresa.company_alias }),
      LimiteDoPlanoException
    )

    // A verificação corre ANTES da transacção, portanto o stock não pode ter saído.
    await lote.refresh()
    assert.equal(Number(lote.quantidade_em_estoque), 9, 'só a primeira venda devia ter saído')
    assert.equal(await faturacaoDoMes(empresa.id), 1000)
  })

  test('o tecto conta a venda que está a ser fechada, não só o passado', async ({ assert }) => {
    // Se contasse só o já facturado, o tecto seria sempre ultrapassado por uma venda — e
    // um tecto que se ultrapassa não é um tecto.
    const empresa = await createEmpresa()
    await darPlano(empresa, { limite_faturacao_mensal: 1_000 })

    await assert.rejects(
      () => assertPodeFacturar(empresa.id, 1_001),
      LimiteDoPlanoException
    )
    await assertPodeFacturar(empresa.id, 1_000) // exactamente no tecto: passa
  })

  test('sem tecto no plano, não há limite de facturação', async ({ assert }) => {
    const empresa = await createEmpresa()
    await darPlano(empresa, { limite_faturacao_mensal: null })

    await assertPodeFacturar(empresa.id, 999_999_999) // não lança
    assert.isTrue(true)
  })
})

test.group('subscrição da empresa', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('o plano gratuito existe e é o de arranque', async ({ assert }) => {
    await semearPlanosPadrao()
    const gratuito = await Plano.findBy('slug', SLUG_PLANO_GRATUITO)

    assert.isNotNull(gratuito)
    assert.equal(Number(gratuito!.preco), 0)
    assert.isNotNull(gratuito!.limite_faturacao_mensal, 'o grátis vive de um tecto de facturação')
    assert.isNotEmpty(gratuito!.funcionalidades)
  })

  test('garantirSubscricao põe a empresa no plano gratuito', async ({ assert }) => {
    await semearPlanosPadrao()
    const empresa = await createEmpresa()
    const repo = new assinaturaRepository()

    const subscricao = await repo.garantirSubscricao(empresa.id)

    assert.isNotNull(subscricao)
    const plano = await planoDaEmpresa(empresa.id)
    assert.equal(plano?.slug, SLUG_PLANO_GRATUITO)
  })

  test('garantirSubscricao é idempotente', async ({ assert }) => {
    await semearPlanosPadrao()
    const empresa = await createEmpresa()
    const repo = new assinaturaRepository()

    const primeira = await repo.garantirSubscricao(empresa.id)
    const segunda = await repo.garantirSubscricao(empresa.id)

    assert.equal(primeira!.id, segunda!.id)
    const todas = await Subscricao.query().where('cliente_id', empresa.id)
    assert.lengthOf(todas, 1)
  })

  test('mudar de plano cancela a anterior e abre uma nova', async ({ assert }) => {
    // A subscrição anterior é o registo de que a empresa esteve naquele plano naquelas
    // datas, e é a ela que as cobranças emitidas estão ligadas — reescrevê-la faria uma
    // factura passada passar a dizer que era de outro plano.
    await semearPlanosPadrao()
    const empresa = await createEmpresa()
    const repo = new assinaturaRepository()

    await repo.garantirSubscricao(empresa.id)
    const pago = await Plano.findByOrFail('slug', 'basico')

    const nova = await repo.escolherPlano(empresa.company_alias, pago.id)

    assert.equal(nova.plano_id, pago.id)

    const todas = await Subscricao.query().where('cliente_id', empresa.id)
    assert.lengthOf(todas, 2)

    const activas = todas.filter((s) => !s.cancelada_em)
    assert.lengthOf(activas, 1, 'só pode haver uma subscrição activa')
    assert.equal(activas[0].id, nova.id)
  })

  test('escolher o mesmo plano duas vezes não abre uma segunda subscrição', async ({ assert }) => {
    await semearPlanosPadrao()
    const empresa = await createEmpresa()
    const repo = new assinaturaRepository()
    const plano = await Plano.findByOrFail('slug', 'basico')

    const primeira = await repo.escolherPlano(empresa.company_alias, plano.id)
    const segunda = await repo.escolherPlano(empresa.company_alias, plano.id)

    assert.equal(primeira.id, segunda.id)
    assert.lengthOf(await Subscricao.query().where('cliente_id', empresa.id), 1)
  })

  test('um plano pago arranca em período livre', async ({ assert }) => {
    await semearPlanosPadrao()
    const empresa = await createEmpresa()
    const repo = new assinaturaRepository()
    const plano = await Plano.findByOrFail('slug', 'basico')

    await repo.escolherPlano(empresa.company_alias, plano.id)
    const estado = await repo.estado(empresa.company_alias)

    assert.isTrue(estado.subscricao?.em_periodo_livre)
    assert.isAbove(estado.subscricao?.dias_ate_ao_fim ?? 0, 0)
  })

  test('o plano gratuito não gera cobrança nenhuma', async ({ assert }) => {
    await semearPlanosPadrao()
    const empresa = await createEmpresa()
    const repo = new assinaturaRepository()
    await repo.garantirSubscricao(empresa.id)

    assert.isNull(await repo.emitirCobrancaPendente(empresa.company_alias))
  })

  test('a cobrança de um plano pago é emitida uma vez só', async ({ assert }) => {
    // Carregar duas vezes em "pagar" não pode gerar duas dívidas.
    await semearPlanosPadrao()
    const empresa = await createEmpresa()
    const repo = new assinaturaRepository()
    const plano = await Plano.findByOrFail('slug', 'basico')
    await repo.escolherPlano(empresa.company_alias, plano.id)

    const primeira = await repo.emitirCobrancaPendente(empresa.company_alias)
    const segunda = await repo.emitirCobrancaPendente(empresa.company_alias)

    assert.isNotNull(primeira)
    assert.equal(primeira!.id, segunda!.id)
    assert.equal(Number(primeira!.valor), Number(plano.preco))

    // A referência é o que torna a cobrança pagável por transferência enquanto o gateway
    // não estiver ligado — sem ela, quem confirma no backoffice tem de adivinhar a que
    // cobrança pertence um pagamento.
    assert.isNotEmpty(primeira!.referencia)
    assert.match(primeira!.referencia, /^SUB-[A-Z]*-\d{6}-[A-Z0-9]{4}$/)
  })

  test('o estado mostra o consumo real contra os limites', async ({ assert }) => {
    const empresa = await createEmpresa()
    await darPlano(empresa, { limite_postos: 2, limite_produtos: 5 })
    await createPos(empresa)
    await createProduto(empresa)
    await createProduto(empresa)

    const uso = await usoDoPlano(empresa.id)

    assert.equal(uso.postos.usado, 1)
    assert.equal(uso.postos.limite, 2)
    assert.equal(uso.produtos.usado, 2)
    assert.equal(uso.produtos.limite, 5)
    assert.isNull(uso.utilizadores.limite, 'não definido no plano = ilimitado')
  })

  test('o estado de uma empresa não mostra o plano de outra', async ({ assert }) => {
    await semearPlanosPadrao()
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const repo = new assinaturaRepository()
    const plano = await Plano.findByOrFail('slug', 'pro')

    await repo.escolherPlano(empresaA.company_alias, plano.id)

    const estadoB = await repo.estado(empresaB.company_alias)
    assert.isNull(estadoB.subscricao)
    assert.isNull(estadoB.uso.plano)
  })
})

/**
 * A rede das permissões, outra vez.
 *
 * É a quinta funcionalidade neste projecto a precisar de permissões novas, e o catálogo é
 * uma lista mantida à mão em `database_seeder.ts` — já ficou para trás em 7.6, 7.8, 7.12 e
 * no onboarding. Um ecrã de Subscrição a que o dono da empresa não chega é exactamente o
 * mesmo bug com outro nome.
 */
const ROTAS_DE_ASSINATURA = [
  { passo: 'ver o plano e o consumo', rota: 'domain_assinatura.estado' },
  { passo: 'listar os planos', rota: 'domain_assinatura.planos' },
  { passo: 'mudar de plano', rota: 'domain_assinatura.escolher' },
  { passo: 'emitir a cobrança', rota: 'domain_assinatura.cobranca' },
]

test.group('RBAC — o dono da empresa chega à subscrição', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('o Admin tem tudo o que o ecrã de Subscrição precisa', async ({ assert }) => {
    const { empresa } = await createTenant()
    const admin = await createUser(empresa, ['Admin'])

    const emFalta: string[] = []
    for (const { passo, rota } of ROTAS_DE_ASSINATURA) {
      if (!(await userHasPermission(admin, rota))) emFalta.push(`${rota} (${passo})`)
    }

    assert.deepEqual(emFalta, [], `falta ao Admin: ${emFalta.join(', ')}`)
  })

  test('o Gerente vê o plano mas não muda nem cobra', async ({ assert }) => {
    // Mudar de plano compromete a empresa com um custo, e emitir a cobrança cria uma
    // dívida. As duas são do dono, não de quem gere o dia-a-dia.
    const { empresa } = await createTenant()
    const gerente = await createUser(empresa, ['Gerente'])

    assert.isTrue(await userHasPermission(gerente, 'domain_assinatura.estado'))
    assert.isTrue(await userHasPermission(gerente, 'domain_assinatura.planos'))
    assert.isFalse(await userHasPermission(gerente, 'domain_assinatura.escolher'))
    assert.isFalse(await userHasPermission(gerente, 'domain_assinatura.cobranca'))
  })

  test('um Vendedor não vê a subscrição da empresa', async ({ assert }) => {
    const { empresa } = await createTenant()
    const vendedor = await createUser(empresa, ['Vendedor'])

    for (const { rota } of ROTAS_DE_ASSINATURA) {
      assert.isFalse(await userHasPermission(vendedor, rota), `${rota} não devia ser do Vendedor`)
    }
  })
})
