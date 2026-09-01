/**
 * `validacao/regras.ts` — o que se recusa antes de gastar uma chamada.
 *
 * Cada teste aqui corresponde a um erro que o BAI devolveria de qualquer
 * maneira. O que se ganha em apanhá-lo cá é o tempo de ida e volta, e o nome do
 * campo: o `INVALID_PARAMETERS` deles não diz qual.
 *
 * E há a outra metade, mais fácil de esquecer: o que estas regras NÃO podem
 * recusar. Um `totalAmount` sem carrinho é legítimo, um carrinho sem IVA é
 * legítimo. Inventar regras produz recusas que ninguém consegue explicar.
 */

import { test } from '@japa/runner'
import { CONFIGURACAO_DE_TESTE } from '../configuracao.js'
import {
  identificacaoDoPagamento,
  validarAnularCativo,
  validarCarrinho,
  validarCativo,
  validarConfirmarCativo,
  validarConsulta,
  validarPedidoPagamento,
  validarQrCode,
  type Violacao,
} from '../validacao/regras.js'

const CFG = CONFIGURACAO_DE_TESTE

const PEDIDO_BOM = {
  customerMsisdn: '244923456789',
  totalAmount: 1500,
  currency: 'AOA',
  externalReference: 'ENC-1',
}

const codigos = (violacoes: Violacao[]) => violacoes.map((v) => v.codigo)
const campos = (violacoes: Violacao[]) => violacoes.map((v) => v.campo)

test.group('validarPedidoPagamento', () => {
  test('deixa passar um pedido bem formado', ({ assert }) => {
    assert.isEmpty(validarPedidoPagamento(PEDIDO_BOM, CFG))
  })

  test('um pedido sem carrinho é legítimo', ({ assert }) => {
    // Não inventar regras: a especificação declara `shoppingCart` opcional.
    assert.isEmpty(validarPedidoPagamento({ ...PEDIDO_BOM, shoppingCart: undefined }, CFG))
  })

  test('recusa um número que não passou pela normalização', ({ assert }) => {
    const violacoes = validarPedidoPagamento({ ...PEDIDO_BOM, customerMsisdn: '923 456 789' }, CFG)

    assert.include(codigos(violacoes), 'INVALID_MSISDN_FORMAT')
    assert.include(violacoes[0].detalhe, 'normalizarMsisdn')
  })

  test('recusa montante zero ou negativo', ({ assert }) => {
    for (const total of [0, -1, Number.NaN]) {
      const violacoes = validarPedidoPagamento({ ...PEDIDO_BOM, totalAmount: total }, CFG)
      assert.include(campos(violacoes), 'totalAmount', `${total} devia ser recusado`)
    }
  })

  test('recusa moeda fora do ISO 4217', ({ assert }) => {
    for (const moeda of ['Kz', 'aoa', 'KWANZA', '']) {
      const violacoes = validarPedidoPagamento({ ...PEDIDO_BOM, currency: moeda }, CFG)
      assert.include(codigos(violacoes), 'INVALID_CURRENCY', `"${moeda}" devia ser recusada`)
    }
  })

  test('recusa referência vazia — é a defesa contra cobrar duas vezes', ({ assert }) => {
    const violacoes = validarPedidoPagamento({ ...PEDIDO_BOM, externalReference: '' }, CFG)

    assert.include(codigos(violacoes), 'INVALID_EXTERNAL_REFERENCE')
    assert.include(violacoes[0].detalhe, 'segunda cobrança')
  })

  test('recusa quando o total não bate com o carrinho', ({ assert }) => {
    // É literalmente o que o SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT diz.
    const violacoes = validarPedidoPagamento(
      {
        ...PEDIDO_BOM,
        totalAmount: 2000,
        shoppingCart: {
          items: [{ amountPerItem: 250, count: 2, discount: 50, totalAmount: 450 }],
          totalCartItems: 1,
          totalCartAmount: 450,
          totalCartAmountWithVat: 513,
        },
      },
      CFG
    )

    assert.include(codigos(violacoes), 'SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT')
  })

  test('compara contra o total COM IVA quando ele existe', ({ assert }) => {
    // É o total com imposto que o cliente paga.
    const carrinho = {
      items: [{ amountPerItem: 250, count: 2, discount: 50, totalAmount: 450 }],
      totalCartItems: 1,
      totalCartAmount: 450,
      totalCartAmountWithVat: 513,
    }

    assert.isEmpty(validarPedidoPagamento({ ...PEDIDO_BOM, totalAmount: 513, shoppingCart: carrinho }, CFG))
    assert.isNotEmpty(validarPedidoPagamento({ ...PEDIDO_BOM, totalAmount: 450, shoppingCart: carrinho }, CFG))
  })

  test('junta todas as violações em vez de parar na primeira', ({ assert }) => {
    // Um pedido com três erros tem de devolver os três: corrigir um de cada vez
    // com o cliente à espera é o que se está a evitar.
    const violacoes = validarPedidoPagamento(
      { customerMsisdn: 'xxx', totalAmount: -5, currency: 'zz', externalReference: '' },
      CFG
    )

    assert.isAtLeast(violacoes.length, 4)
  })
})

test.group('validarCarrinho', () => {
  test('apanha a linha cujo total não é preço × quantidade − desconto', ({ assert }) => {
    const violacoes: Violacao[] = []
    validarCarrinho(
      { items: [{ amountPerItem: 250, count: 2, discount: 50, totalAmount: 999 }], totalCartItems: 1 },
      CFG,
      violacoes
    )

    assert.include(codigos(violacoes), 'SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT')
    assert.include(campos(violacoes), 'shoppingCart.items[0].totalAmount')
    assert.include(violacoes[0].detalhe, '450,00')
  })

  test('apanha o total do carrinho que não é a soma das linhas', ({ assert }) => {
    const violacoes: Violacao[] = []
    validarCarrinho(
      {
        items: [
          { amountPerItem: 100, count: 1, totalAmount: 100 },
          { amountPerItem: 200, count: 1, totalAmount: 200 },
        ],
        totalCartItems: 2,
        totalCartAmount: 500,
      },
      CFG,
      violacoes
    )

    assert.include(campos(violacoes), 'shoppingCart.totalCartAmount')
  })

  test('apanha totalCartItems em desacordo com o array', ({ assert }) => {
    const violacoes: Violacao[] = []
    validarCarrinho(
      { items: [{ amountPerItem: 100, count: 1, totalAmount: 100 }], totalCartItems: 5 },
      CFG,
      violacoes
    )

    assert.include(campos(violacoes), 'shoppingCart.totalCartItems')
  })

  test('exige o id da percentagem de IVA, não o valor', ({ assert }) => {
    // Enviar `{ value: 14 }` sem `id` devolve SHOPPING_CART_VAT_PERCENTAGES_NOT_FOUND.
    const violacoes: Violacao[] = []
    validarCarrinho(
      {
        items: [{ amountPerItem: 100, count: 1, totalAmount: 100, vatPercentage: { value: 14 } }],
        totalCartItems: 1,
      },
      CFG,
      violacoes
    )

    assert.include(codigos(violacoes), 'SHOPPING_CART_VAT_PERCENTAGES_NOT_FOUND')
  })

  test('aceita um carrinho cujas linhas ainda não têm totais', ({ assert }) => {
    // É o carrinho que se manda ao BAI calcular. Recusá-lo aqui tornaria
    // `calcularCarrinho()` impossível de usar.
    const violacoes: Violacao[] = []
    validarCarrinho({ items: [{ description: 'Artigo', amountPerItem: 250, count: 2 }] }, CFG, violacoes)

    assert.isEmpty(violacoes)
  })

  test('carrinho ausente não é um erro', ({ assert }) => {
    const violacoes: Violacao[] = []
    validarCarrinho(undefined, CFG, violacoes)
    assert.isEmpty(violacoes)
  })

  test('tolera o cêntimo que os rateios de desconto e IVA produzem', ({ assert }) => {
    const violacoes: Violacao[] = []
    validarCarrinho(
      {
        items: [{ amountPerItem: 33.33, count: 3, discount: 0, totalAmount: 99.99 }],
        totalCartItems: 1,
        totalCartAmount: 100,
      },
      CFG,
      violacoes
    )

    assert.isEmpty(violacoes)
  })
})

test.group('cativo', () => {
  const CATIVO_BOM = {
    customerMsisdn: '244923456789',
    estimatedAmount: 1000,
    maxAmount: 1500,
    currency: 'AOA',
    externalReference: 'CAP-1',
  }

  test('deixa passar um cativo bem formado', ({ assert }) => {
    assert.isEmpty(validarCativo(CATIVO_BOM, CFG))
  })

  test('recusa maxAmount abaixo do estimado', ({ assert }) => {
    // A regra que a especificação escreve por extenso. Apanhá-la aqui poupa uma
    // pré-autorização recusada com o cliente à frente.
    const violacoes = validarCativo({ ...CATIVO_BOM, maxAmount: 500 }, CFG)

    assert.include(campos(violacoes), 'maxAmount')
    assert.include(violacoes[0].detalhe, '1000,00')
  })

  test('aceita maxAmount igual ao estimado', ({ assert }) => {
    assert.isEmpty(validarCativo({ ...CATIVO_BOM, maxAmount: 1000 }, CFG))
  })

  test('a confirmação exige identificar o pagamento', ({ assert }) => {
    const violacoes = validarConfirmarCativo({ finalAmount: 900 }, CFG)

    assert.include(campos(violacoes), 'paymentId/externalReference')
  })

  test('a confirmação recusa um valor acima do tecto autorizado', ({ assert }) => {
    const violacoes = validarConfirmarCativo({ paymentId: 1, finalAmount: 2000 }, CFG, 1500)

    assert.include(campos(violacoes), 'finalAmount')
    assert.include(violacoes[0].detalhe, '1500,00')
  })

  test('sem o tecto conhecido, não inventa a regra', ({ assert }) => {
    // Nem sempre se tem o `maxAmount` à mão. Sem ele, esta verificação não corre
    // — em vez de adivinhar um valor.
    assert.isEmpty(validarConfirmarCativo({ paymentId: 1, finalAmount: 2000 }, CFG))
  })

  test('a anulação exige identificar o pagamento', ({ assert }) => {
    assert.isNotEmpty(validarAnularCativo({}))
    assert.isEmpty(validarAnularCativo({ paymentId: 987 }))
    assert.isEmpty(validarAnularCativo({ externalReference: 'CAP-1' }))
  })
})

test.group('identificacaoDoPagamento (#C-06)', () => {
  test('um dos dois chega; nenhum não chega', ({ assert }) => {
    // A especificação declara os dois opcionais e escreve na descrição que um
    // deles tem de vir. Um pedido sem nenhum é válido no esquema e impossível na
    // prática.
    const semNada: Violacao[] = []
    identificacaoDoPagamento({}, semNada)
    assert.isNotEmpty(semNada)

    const soId: Violacao[] = []
    identificacaoDoPagamento({ paymentId: 987 }, soId)
    assert.isEmpty(soId)

    const soReferencia: Violacao[] = []
    identificacaoDoPagamento({ externalReference: 'ENC-1' }, soReferencia)
    assert.isEmpty(soReferencia)
  })

  test('a consulta usa a mesma regra', ({ assert }) => {
    assert.isNotEmpty(validarConsulta({}))
    assert.isEmpty(validarConsulta({ externalReference: 'ENC-1' }))
  })
})

test.group('validarQrCode', () => {
  test('exige ponto de aceitação, valor e moeda', ({ assert }) => {
    const violacoes = validarQrCode({ acceptancePointId: 0, amount: 0, currency: '' })

    assert.includeMembers(campos(violacoes), ['acceptancePointId', 'amount', 'currency'])
    assert.include(violacoes[0].detalhe, 'BAIPAGA_ACCEPTANCE_POINT_ID')
  })

  test('deixa passar um pedido bem formado', ({ assert }) => {
    assert.isEmpty(validarQrCode({ acceptancePointId: 456, amount: 500, currency: 'AOA' }))
  })

  test('largura e altura são opcionais, mas se vierem têm de fazer sentido', ({ assert }) => {
    assert.isEmpty(validarQrCode({ acceptancePointId: 456, amount: 500, currency: 'AOA', width: 300 }))
    assert.isNotEmpty(
      validarQrCode({ acceptancePointId: 456, amount: 500, currency: 'AOA', width: -1 })
    )
  })
})
