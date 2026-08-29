import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Plano from '#models/plano'
import { PLANOS_PADRAO, semearPlanosPadrao } from '../../app/helpers/planos_padrao.js'

/**
 * O que o cartão do plano mostra — e porque é que já não é texto escrito à mão.
 *
 * As quatro primeiras entradas de `funcionalidades` diziam exactamente o mesmo que os
 * quatro `limite_*`: "Até 2 utilizadores" ao lado de `limite_utilizadores: 2`. Enquanto
 * ninguém mexia nos planos isso era só repetição. Deixou de ser no dia em que `plano`
 * ganhou CRUD no backoffice: mudar o limite fazia o backend passar a aceitar o número
 * novo e o cartão continuar a prometer o antigo.
 *
 * `limites_descritos` é derivado dos números. Estes testes são o que impede as duas
 * coisas de voltarem a divergir.
 */

/** Um plano em memória, sem tocar na base de dados — o getter não precisa de mais. */
function planoCom(limites: Partial<Plano>): Plano {
  const p = new Plano()
  p.moeda = 'Kz'
  p.limite_utilizadores = null
  p.limite_postos = null
  p.limite_produtos = null
  p.limite_faturacao_mensal = null
  Object.assign(p, limites)
  return p
}

test.group('cartão do plano — limites_descritos', () => {
  test('reproduz exactamente o que o cartão do plano Grátis mostrava', async ({ assert }) => {
    const p = planoCom({
      limite_utilizadores: 2,
      limite_postos: 1,
      limite_produtos: 150,
      limite_faturacao_mensal: 500_000,
    })

    assert.deepEqual(p.limites_descritos, [
      'Até 2 utilizadores',
      '1 posto de atendimento',
      'Até 150 produtos',
      'Facturação até 500.000 Kz por mês',
    ])
  })

  test('agrupa os milhares mesmo em números de 4 dígitos', async ({ assert }) => {
    // "Até 2.000 produtos", não "Até 2000". O `toLocaleString('pt-PT')` não agrupa
    // 4 dígitos, e punha "2000" ao lado de "500.000" no mesmo cartão.
    const p = planoCom({ limite_produtos: 2_000 })
    assert.include(p.limites_descritos, 'Até 2.000 produtos')
  })

  test('singular quando o limite é 1', async ({ assert }) => {
    const p = planoCom({ limite_utilizadores: 1, limite_postos: 1, limite_produtos: 1 })
    assert.deepEqual(p.limites_descritos.slice(0, 3), [
      '1 utilizador',
      '1 posto de atendimento',
      '1 produto',
    ])
  })

  test('`null` diz "sem limite", nunca "0"', async ({ assert }) => {
    assert.deepEqual(planoCom({}).limites_descritos, [
      'Utilizadores sem limite',
      'Postos de atendimento sem limite',
      'Produtos sem limite',
      'Facturação sem tecto',
    ])
  })

  test('`0` também diz "sem limite" — como o backend o trata', async ({ assert }) => {
    // Um plano mal preenchido no backoffice é tratado como ilimitado por
    // `limites_do_plano.ts`, para não trancar a empresa de um cliente. A frase tem de
    // dizer o mesmo que o sistema faz, senão o cartão promete um limite que não existe.
    const p = planoCom({ limite_utilizadores: 0, limite_postos: 0, limite_produtos: 0 })
    assert.deepEqual(p.limites_descritos.slice(0, 3), [
      'Utilizadores sem limite',
      'Postos de atendimento sem limite',
      'Produtos sem limite',
    ])
  })

  test('escreve "Kz" a partir do código "AOA" guardado na coluna', async ({ assert }) => {
    // A coluna guarda o código ISO, que é o correcto para uma coluna. Mas o produto
    // inteiro escreve "Kz" — o preço ao lado, no mesmo cartão, é formatado assim. Sem a
    // tradução saía "Facturação até 500.000 AOA por mês" ao lado de "7.500 Kz".
    const p = planoCom({ moeda: 'AOA', limite_faturacao_mensal: 500_000 })
    assert.include(p.limites_descritos, 'Facturação até 500.000 Kz por mês')
  })

  test('uma moeda desconhecida sai tal e qual, sem se inventar um símbolo', async ({ assert }) => {
    const p = planoCom({ moeda: 'USD', limite_faturacao_mensal: 1_500 })
    assert.include(p.limites_descritos, 'Facturação até 1.500 USD por mês')
  })

  test('mudar o limite muda a frase — era isto que não acontecia', async ({ assert }) => {
    const p = planoCom({ limite_utilizadores: 2 })
    assert.include(p.limites_descritos, 'Até 2 utilizadores')

    // O que um administrador faz no backoffice.
    p.limite_utilizadores = 5
    assert.include(p.limites_descritos, 'Até 5 utilizadores')
    assert.notInclude(p.limites_descritos, 'Até 2 utilizadores')
  })
})

test.group('cartão do plano — nada é dito duas vezes', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('os planos padrão não repetem os limites em `funcionalidades`', async ({ assert }) => {
    // A rede contra o regresso do problema: se alguém voltar a escrever "Até 150
    // produtos" à mão na lista, o cartão passa a mostrá-lo duas vezes — uma derivada e
    // uma escrita — e as duas podem discordar.
    for (const padrao of PLANOS_PADRAO) {
      for (const f of padrao.funcionalidades) {
        assert.notMatch(
          f,
          /utilizador|posto de atendimento|produtos|Facturação/i,
          `"${f}" (plano ${padrao.slug}) repete um limite que agora é derivado`
        )
      }
    }
  })

  test('nem repetem o período livre, que o cartão já mostra à parte', async ({ assert }) => {
    // O ecrã mostra `dias_gratuitos` no topo do cartão. "14 dias livres para
    // experimentar" também estava na lista, e aparecia duas vezes no mesmo cartão.
    for (const padrao of PLANOS_PADRAO) {
      for (const f of padrao.funcionalidades) {
        assert.notMatch(f, /dias livres|experimentar/i, `"${f}" repete os dias gratuitos`)
      }
    }
  })

  test('o que sai da base de dados traz as duas listas, sem sobreposição', async ({ assert }) => {
    await semearPlanosPadrao()

    const plano = await Plano.query().where('slug', 'gratuito').firstOrFail()
    const json = plano.serialize() as Record<string, unknown>

    // `@computed` — chega ao frontend sem nenhum endpoint ter de o montar.
    assert.isArray(json.limites_descritos)
    assert.lengthOf(json.limites_descritos as string[], 4)
    assert.include(json.limites_descritos as string[], 'Até 2 utilizadores')
    // O plano semeado tem `moeda: 'AOA'` — a linha tem de sair em "Kz", como o resto
    // do cartão.
    assert.include(json.limites_descritos as string[], 'Facturação até 500.000 Kz por mês')

    // E a lista editável continua lá, com o que não é limite.
    assert.include(plano.funcionalidades, 'Ponto de venda e controlo de stock')
  })
})
