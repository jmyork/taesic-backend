import { test } from '@japa/runner'

import {
  CONDICOES_DE_PAGAMENTO,
  type CondicaoPagamento,
  REGRAS_DA_CONDICAO,
  documentoDaVenda,
  regraDa,
} from '../../app/helpers/regras_de_emissao.js'
import { TIPOS_DE_DOCUMENTO, aceitaVencimento } from '../../app/helpers/tipos_de_documento.js'

/**
 * A decisão que o fluxo de venda passou a tomar sozinho.
 *
 * ── O que estes testes guardam ──────────────────────────────────────────────
 *
 * O tipo de documento deixou de ser uma escolha do utilizador e passou a ser uma
 * consequência de duas coisas: como a venda é paga, e se o comprador se
 * identificou. Escolher mal significa declarar a operação com o documento errado —
 * e o utilizador já não tem como corrigir isso ao balcão, porque já não escolhe.
 *
 * Por isso a tabela é testada aqui, sem base de dados: são três condições e duas
 * respostas cada uma, e cabem todas escritas.
 */
test.group('condição de pagamento — o documento que sai de cada uma', () => {
  test('sem NIF, uma venda a pronto pagamento dá factura genérica', ({ assert }) => {
    assert.equal(
      documentoDaVenda({ condicao: 'pronto_pagamento', temNif: false }),
      'Factura Genérica'
    )
  })

  test('com NIF, uma venda a pronto pagamento dá factura-recibo', ({ assert }) => {
    assert.equal(documentoDaVenda({ condicao: 'pronto_pagamento', temNif: true }), 'Factura-Recibo')
  })

  test('a crédito dá sempre Factura, com ou sem NIF', ({ assert }) => {
    /*
     * O `temNif: false` aqui nunca chega a acontecer no fluxo — o fecho recusa uma
     * venda a crédito sem cliente identificado. Está testado à mesma para a função
     * não passar a devolver uma genérica se essa recusa alguma vez cair: uma
     * genérica a prazo seria uma dívida sem devedor.
     */
    assert.equal(documentoDaVenda({ condicao: 'credito', temNif: true }), 'Factura')
    assert.equal(documentoDaVenda({ condicao: 'credito', temNif: false }), 'Factura')
  })

  test('um adiantamento dá sempre Factura de Adiantamento', ({ assert }) => {
    assert.equal(
      documentoDaVenda({ condicao: 'adiantamento', temNif: true }),
      'Factura de Adiantamento'
    )
  })

  /** Toda a condição produz um tipo que existe na tabela. */
  test('nenhuma condição produz um tipo inexistente', ({ assert }) => {
    for (const condicao of CONDICOES_DE_PAGAMENTO) {
      for (const temNif of [true, false]) {
        const tipo = documentoDaVenda({ condicao, temNif })
        assert.property(TIPOS_DE_DOCUMENTO, tipo, `"${condicao}" produziu um tipo desconhecido`)
      }
    }
  })
})

test.group('condição de pagamento — as regras têm de concordar entre si', () => {
  test('toda a condição tem regra', ({ assert }) => {
    for (const condicao of CONDICOES_DE_PAGAMENTO) {
      assert.property(REGRAS_DA_CONDICAO, condicao)
    }
  })

  /**
   * A invariante que mais custa a ver espalhada por `if`, e a razão de a tabela
   * existir: **o documento tem de dizer o mesmo que o dinheiro**.
   *
   * Uma condição que exija o pagamento no acto e ao mesmo tempo produza um
   * documento que aceita data de vencimento poria dinheiro já recebido no mapa de
   * cobranças. O inverso — não exigir pagamento e produzir um documento que não
   * aceita vencimento — daria uma dívida sem prazo, que nenhum aviso de cobrança
   * consegue reclamar porque não sabe a partir de quando.
   */
  test('quem exige pagamento no acto não produz um documento em dívida', ({ assert }) => {
    for (const condicao of CONDICOES_DE_PAGAMENTO) {
      const regra = regraDa(condicao)
      const tipo = documentoDaVenda({ condicao, temNif: true })

      if (regra.exigePagamento) {
        assert.isFalse(
          aceitaVencimento(tipo),
          `"${condicao}" recebe no acto mas emite "${tipo}", que pode nascer em dívida`
        )
      } else {
        assert.isTrue(
          aceitaVencimento(tipo),
          `"${condicao}" não recebe nada mas emite "${tipo}", que não aceita prazo`
        )
      }
    }
  })

  /**
   * Só o adiantamento não é receita — e é ele, e só ele, que não move stock.
   *
   * As duas coisas são a MESMA: não houve entrega. Se um dia divergirem, o
   * relatório de lucro passa a contar receita de mercadoria que continua no
   * armazém (margem de 100%), ou a contar custo sem receita (margem negativa).
   */
  test('não é receita se e só se o stock não sai', ({ assert }) => {
    for (const condicao of CONDICOES_DE_PAGAMENTO) {
      const regra = regraDa(condicao)
      assert.equal(
        regra.eReceita,
        regra.saiStock,
        `"${condicao}" desalinha o reconhecimento da receita da saída de armazém`
      )
    }
  })

  test('só o pronto pagamento dispensa a identificação do comprador', ({ assert }) => {
    assert.isFalse(regraDa('pronto_pagamento').exigeNif)
    assert.isTrue(regraDa('credito').exigeNif, 'uma dívida sem devedor não é cobrável')
    assert.isTrue(regraDa('adiantamento').exigeNif, 'há uma entrega por fazer, e a alguém')
  })

  test('o valor por omissão descreve o que este sistema sempre fez', ({ assert }) => {
    const omissao: CondicaoPagamento = 'pronto_pagamento'
    const regra = regraDa(omissao)

    assert.isTrue(regra.exigePagamento, 'era a única coisa que o fecho permitia')
    assert.isTrue(regra.saiStock)
    assert.isTrue(regra.eReceita)
  })
})
