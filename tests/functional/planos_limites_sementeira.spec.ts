import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import Plano from '#models/plano'
import Subscricao from '#models/subscricao'
import Empresa from '#models/empresa'
import produtos from '#models/faturacao/produtos'
import onboardingRepository from '#repositories/onboarding_repository'
import posRepository from '#repositories/pos_repository'
import LimiteDoPlanoException from '#exceptions/limite_do_plano_exception'
import {
  espacoParaProdutos,
  assertPodeCriarProduto,
} from '../../app/helpers/limites_do_plano.js'
import {
  RAMOS_DE_ACTUACAO,
  semearRamosDeActuacao,
} from '../../app/helpers/ramos_de_actuacao.js'
import { createEmpresa } from '../helpers/fixtures.js'

/**
 * O limite de produtos do plano, no caminho que o contornava.
 *
 * `assertPodeCriarProduto` responde a "posso criar mais UM?", e cobria os dois pontos
 * onde um produto nasce um de cada vez. Mas o onboarding cria-os às dezenas
 * (`semearRamosDeActuacao` -> `produtos.createMany`) e nunca passava por lá.
 *
 * Não era teórico: a união dos catálogos dos ramos são 174 produtos e o plano Grátis
 * permite 150. Uma empresa que escolhesse ramos que cheguem saía do onboarding com
 * mais produtos do que o cartão do plano lhe prometia — e a partir daí o backend
 * recusava-lhe o produto seguinte, por um limite que ela nunca soube ter ultrapassado.
 */

/** Um plano à medida do teste, e a subscrição que o liga à empresa. */
async function darPlano(empresa: Empresa, limiteProdutos: number | null) {
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
    limite_produtos: limiteProdutos,
    limite_faturacao_mensal: null,
  } as any)

  await Subscricao.create({
    cliente_id: empresa.id,
    plano_id: plano.id,
    status: 'ATIVA',
    data_inicio: new Date(),
    data_fim: null as unknown as Date,
    renova: true,
  })

  return plano
}

const contarProdutos = async (empresaId: string) =>
  Number(
    (
      await db
        .from('produtos')
        .where('empresa_id', empresaId)
        .whereNull('deleted_at')
        .count('* as total')
        .first()
    )?.total ?? 0
  )

/** Os ramos com produtos, do maior para o menor — para chegar depressa a um total alto. */
const ramosComProdutos = [...RAMOS_DE_ACTUACAO]
  .filter((r) => r.produtos.length > 0)
  .sort((a, b) => b.produtos.length - a.produtos.length)
  .map((r) => r.id)

test.group('limites do plano — espacoParaProdutos', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sem plano, o espaço é ilimitado', async ({ assert }) => {
    // Regra 1: sem plano, sem limite. `null` e não zero — zero trancaria a empresa.
    const empresa = await createEmpresa()
    assert.isNull(await espacoParaProdutos(empresa.id))
  })

  test('com limite nulo (plano Pro), o espaço é ilimitado', async ({ assert }) => {
    const empresa = await createEmpresa()
    await darPlano(empresa, null)
    assert.isNull(await espacoParaProdutos(empresa.id))
  })

  test('devolve o que falta para o limite', async ({ assert }) => {
    const empresa = await createEmpresa()
    await darPlano(empresa, 10)

    assert.equal(await espacoParaProdutos(empresa.id), 10)

    await produtos.create({ nome: 'Um', empresa_id: empresa.id, numero: 1 } as any)
    await produtos.create({ nome: 'Dois', empresa_id: empresa.id, numero: 2 } as any)

    assert.equal(await espacoParaProdutos(empresa.id), 8)
  })

  test('nunca devolve um número negativo', async ({ assert }) => {
    // Acontece de verdade: uma empresa com 5 produtos que mude para um plano de 2 fica
    // acima do limite. O espaço é 0, e um número negativo faria `slice(0, -3)` cortar
    // pelo fim da lista em vez de não criar nada.
    const empresa = await createEmpresa()
    await darPlano(empresa, 2)

    for (let i = 1; i <= 5; i++) {
      await produtos.create({ nome: `P${i}`, empresa_id: empresa.id, numero: i } as any)
    }

    assert.equal(await espacoParaProdutos(empresa.id), 0)
  })
})

test.group('limites do plano — a sementeira do onboarding', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('o catálogo de todos os ramos excede o plano Grátis', async ({ assert }) => {
    // A premissa do problema, fixada aqui para não se perder: se alguém acrescentar
    // ramos ou produtos, este número cresce e o limite continua a ser 150.
    const total = RAMOS_DE_ACTUACAO.reduce((n, r) => n + r.produtos.length, 0)
    assert.isAbove(total, 150, 'a união dos catálogos passa o limite do plano Grátis')
  })

  test('semeia só o que cabe, e diz quantos ficaram de fora', async ({ assert }) => {
    const empresa = await createEmpresa()
    await darPlano(empresa, 25)

    const resultado = await db.transaction((trx) =>
      semearRamosDeActuacao(empresa.id, ramosComProdutos, trx)
    )

    assert.equal(resultado.produtos_criados, 25, 'criou exactamente o que cabia')
    assert.isAbove(resultado.produtos_omitidos, 0, 'e diz que deixou produtos de fora')
    assert.equal(await contarProdutos(empresa.id), 25)
  })

  test('a empresa NUNCA fica acima do limite do plano', async ({ assert }) => {
    // O teste que descreve o defeito. Antes desta correcção a contagem final era 174
    // com um limite de 150 — e nada o assinalava.
    const empresa = await createEmpresa()
    await darPlano(empresa, 150)

    await db.transaction((trx) => semearRamosDeActuacao(empresa.id, ramosComProdutos, trx))

    const total = await contarProdutos(empresa.id)
    assert.isAtMost(total, 150, `a empresa ficou com ${total} produtos num plano de 150`)
  })

  test('sem plano, semeia tudo — a regra 1 continua a valer', async ({ assert }) => {
    const empresa = await createEmpresa()

    const resultado = await db.transaction((trx) =>
      semearRamosDeActuacao(empresa.id, ramosComProdutos, trx)
    )

    assert.equal(resultado.produtos_omitidos, 0)
    assert.isAbove(resultado.produtos_criados, 150)
  })

  test('sem espaço nenhum, não cria produtos mas cria as categorias', async ({ assert }) => {
    // As categorias não são limitadas por plano nenhum, e sem elas o dono ficava com um
    // catálogo sem estrutura para organizar o que vier a criar à mão.
    //
    // O plano tem limite 2 e a empresa já tem 2 produtos — e NÃO um plano com limite 0.
    // Zero é tratado como ILIMITADO neste sistema, de propósito: um plano mal preenchido
    // no backoffice não pode trancar a empresa de um cliente (ver `limites_do_plano.ts`).
    const empresa = await createEmpresa()
    await darPlano(empresa, 2)
    await produtos.create({ nome: 'Já cá estava', empresa_id: empresa.id, numero: 1 } as any)
    await produtos.create({ nome: 'E este também', empresa_id: empresa.id, numero: 2 } as any)

    assert.equal(await espacoParaProdutos(empresa.id), 0)

    const resultado = await db.transaction((trx) =>
      semearRamosDeActuacao(empresa.id, ['farmacia'], trx)
    )

    assert.equal(resultado.produtos_criados, 0)
    assert.isAbove(resultado.produtos_omitidos, 0)
    assert.isAbove(resultado.categorias_criadas, 0)
  })

  test('os produtos criados ficam com a categoria certa', async ({ assert }) => {
    // O corte da lista introduziu um `slice`, e a ligação produto->categoria é feita por
    // índice. Se as duas listas se desalinharem, os produtos ficam com a categoria de
    // outro — silenciosamente.
    const empresa = await createEmpresa()
    await darPlano(empresa, 3)

    await db.transaction((trx) => semearRamosDeActuacao(empresa.id, ['farmacia'], trx))

    const ligacoes = await db
      .from('categorias_produtos as cp')
      .join('produtos as p', 'p.id', 'cp.produto_id')
      .join('produto_categorias as pc', 'pc.id', 'cp.produto_categoria_id')
      .where('p.empresa_id', empresa.id)
      .select('p.nome as produto', 'pc.nome as categoria')

    assert.lengthOf(ligacoes, 3)
    // Os três primeiros produtos de "Farmácia" são todos de "Medicamentos".
    for (const l of ligacoes) {
      assert.equal(l.categoria, 'Medicamentos', `"${l.produto}" ficou na categoria errada`)
    }
  })

  test('pelo onboarding a sério, o limite também é respeitado', async ({ assert }) => {
    // Pelo repositório real, que é o caminho que a rota usa — e não só pelo helper.
    const empresa = await createEmpresa()
    await darPlano(empresa, 20)

    const resultado = await new onboardingRepository().aplicarRamos({
      company_alias: empresa.company_alias,
      ramos: ramosComProdutos,
    })

    assert.equal(resultado.produtos_criados, 20)
    assert.isAbove(resultado.produtos_omitidos, 0)
    assert.equal(await contarProdutos(empresa.id), 20)

    // E o produto seguinte é recusado, como deve ser.
    await assert.rejects(() => assertPodeCriarProduto(empresa.id))
  })
})

/**
 * A corrida entre dois pedidos simultâneos.
 *
 * ⚠️ Este grupo NÃO usa `withGlobalTransaction()`, e não pode usar: o que se testa é
 * o comportamento de DUAS transacções concorrentes, e envolver tudo numa terceira
 * elimina precisamente a concorrência. As linhas são apagadas à mão no fim.
 *
 * O defeito que isto fixa: `assertPodeCriar*` conta e depois insere-se, e entre as
 * duas coisas cabe outro pedido. No plano Grátis (1 posto de atendimento), dois
 * cliques no botão liam ambos "0 postos", passavam ambos, e a empresa ficava com
 * dois — um limite que se contorna carregando duas vezes não é um limite. A
 * verificação passou a correr dentro da transacção que insere, com um lock na linha
 * da empresa.
 */
test.group('limites do plano — dois pedidos ao mesmo tempo', (group) => {
  const aLimpar: string[] = []

  group.each.teardown(async () => {
    for (const empresaId of aLimpar.splice(0)) {
      await db.from('pos').where('empresa_id', empresaId).delete()
      await db.from('produtos').where('empresa_id', empresaId).delete()
      // O plano ANTES da subscrição: é por ela que se sabe qual é. Apagar a subscrição
      // primeiro deixava a linha de `plano` órfã — e cada corrida da suite acrescentava
      // mais uma, até o catálogo de planos de uma base de desenvolvimento ficar cheio
      // de "Plano de Teste".
      const planosDoTeste = await db
        .from('subscricao')
        .where('cliente_id', empresaId)
        .select('plano_id')
      await db.from('subscricao').where('cliente_id', empresaId).delete()
      const ids = planosDoTeste.map((p: { plano_id: string }) => p.plano_id)
      if (ids.length > 0) await db.from('plano').whereIn('id', ids).delete()
      await db.from('papel_permissao').whereIn(
        'papel_id',
        db.from('papel').where('empresa_id', empresaId).select('id')
      ).delete()
      await db.from('papel').where('empresa_id', empresaId).delete()
      await db.from('empresa').where('id', empresaId).delete()
    }
  })

  test('só UM de dois postos simultâneos é criado num plano de 1', async ({ assert }) => {
    const empresa = await createEmpresa()
    aLimpar.push(empresa.id)
    await darPlano(empresa, null)
    await db
      .from('plano')
      .whereIn('id', db.from('subscricao').where('cliente_id', empresa.id).select('plano_id'))
      .update({ limite_postos: 1 })

    const repo = new posRepository()
    const criar = (nome: string) =>
      repo.create({
        nome,
        email: `${nome}@example.com`,
        localizacao: 'Luanda',
        contacto: '900000000',
        company_alias: empresa.company_alias,
      } as any)

    const resultados = await Promise.allSettled([criar('Sede A'), criar('Sede B')])

    const criados = resultados.filter((r) => r.status === 'fulfilled').length
    const recusados = resultados.filter(
      (r) => r.status === 'rejected' && r.reason instanceof LimiteDoPlanoException
    ).length

    const naBase = Number(
      (
        await db
          .from('pos')
          .where('empresa_id', empresa.id)
          .whereNull('deleted_at')
          .count('* as total')
          .first()
      )?.total ?? 0
    )

    assert.equal(criados, 1, 'exactamente um pedido devia ter passado')
    assert.equal(recusados, 1, 'o outro devia ter sido recusado com LimiteDoPlanoException')
    assert.equal(naBase, 1, `a empresa ficou com ${naBase} postos num plano de 1`)
  })
})
