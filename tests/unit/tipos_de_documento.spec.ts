import { test } from '@japa/runner'

import {
  type FacturaTipo,
  TIPOS_DE_DOCUMENTO,
  TIPOS_DE_DOCUMENTO_VALIDOS,
  TIPOS_DE_RECIBO,
  TIPOS_QUE_EXIGEM_ORIGEM,
  TIPOS_QUE_EXIGEM_PERIODO,
  TIPOS_QUE_EXIGEM_VENDA,
  designacaoDe,
  referenciaDe,
  serieDefault,
} from '../../app/helpers/tipos_de_documento.js'
import {
  TIPOS_DOCUMENTO,
  eNotaDeCredito,
  exigeRecibo,
} from '../../minfin-integration/dominio/tipos_documento.js'

/**
 * A tabela de tipos de documento, contra o Decreto Presidencial 71/25 e contra o
 * Blueprint da AGT.
 *
 * Unitários, sem base de dados: o que se verifica aqui são acordos entre tabelas,
 * e nenhum deles precisa de uma linha gravada. São também os acordos que, se se
 * quebrarem, só dariam erro do outro lado da rede — a AGT a recusar um documento
 * já emitido, horas depois, na varredura.
 */

test.group('tipos de documento — acordo com o Blueprint da AGT', () => {
  test('todo o tipo tem um código que a AGT conhece', ({ assert }) => {
    for (const tipo of TIPOS_DE_DOCUMENTO_VALIDOS) {
      const codigo = TIPOS_DE_DOCUMENTO[tipo].codigo
      assert.property(
        TIPOS_DOCUMENTO,
        codigo,
        `"${tipo}" mapeia para "${codigo}", que não é um documentType do Blueprint`
      )
    }
  })

  /**
   * O acordo mais caro de quebrar da tabela inteira.
   *
   * `eRecibo` decide se o documento vai com `paymentReceipt` ou com `lines`. Se
   * discordar do `exigeRecibo()` do módulo da AGT, o documento sai com o campo
   * errado e volta com E26 (linhas num recibo) ou E27 (recibo numa factura) — já
   * emitido, já numerado, e sem nada do lado de cá a ter avisado.
   *
   * A armadilha concreta: `AC` leva linhas e `AR` leva recibo. Um caractere de
   * diferença no código, campos obrigatórios opostos.
   */
  test('eRecibo concorda com o exigeRecibo() do módulo da AGT', ({ assert }) => {
    for (const tipo of TIPOS_DE_DOCUMENTO_VALIDOS) {
      const definicao = TIPOS_DE_DOCUMENTO[tipo]
      assert.equal(
        definicao.eRecibo,
        exigeRecibo(definicao.codigo),
        `"${tipo}" (${definicao.codigo}): a tabela diz eRecibo=${definicao.eRecibo} e o ` +
          `Blueprint diz ${exigeRecibo(definicao.codigo)}`
      )
    }
  })

  test('a nota de crédito exige documento de origem (E13)', ({ assert }) => {
    const nc = TIPOS_DE_DOCUMENTO['Nota de Crédito']

    assert.isTrue(eNotaDeCredito(nc.codigo))
    assert.isTrue(nc.exigeOrigem, 'a AGT recusa uma NC sem referência à origem com E13')
  })

  test('AC leva linhas e AR leva recibo', ({ assert }) => {
    assert.isFalse(TIPOS_DE_DOCUMENTO['Aviso de Cobrança'].eRecibo)
    assert.isTrue(TIPOS_DE_DOCUMENTO['Aviso de Cobrança-Recibo'].eRecibo)
  })
})

test.group('tipos de documento — cobertura do Decreto Presidencial 71/25', () => {
  /**
   * Os documentos que os art.ºs 3.º e 4.º nomeiam. O despacho aduaneiro está na
   * lista da lei e não aqui de propósito: quem o emite são as Alfândegas.
   *
   * Os quatro tipos de seguros do Blueprint (RP, RA, CS, LD) também não constam —
   * não estão no decreto e não são documentos deste negócio.
   */
  const exigidosPelaLei = [
    'Factura',
    'Factura-Recibo',
    'Factura Genérica',
    'Factura Global',
    'Factura de Adiantamento',
    'Autofacturação',
    'Nota de Crédito',
    'Nota de Débito',
    'Talão de Venda',
    'Aviso de Cobrança',
    'Aviso de Cobrança-Recibo',
    'Recibo',
    'Outros Recibos',
    'Estorno',
  ]

  for (const tipo of exigidosPelaLei) {
    test(`o sistema emite "${tipo}"`, ({ assert }) => {
      assert.include(TIPOS_DE_DOCUMENTO_VALIDOS as string[], tipo)
    })
  }

  /**
   * Os quatro que já estavam gravados em produção antes desta passagem. Se algum
   * mudar de grafia, as facturas emitidas deixam de corresponder ao `enum` e ao
   * model — e um documento fiscal emitido não se reescreve.
   */
  test('os quatro tipos anteriores mantêm a grafia exacta', ({ assert }) => {
    for (const tipo of ['Factura', 'Factura-Recibo', 'Nota de Crédito', 'Nota de Débito']) {
      assert.include(TIPOS_DE_DOCUMENTO_VALIDOS as string[], tipo)
    }
  })
})

test.group('tipos de documento — o tipo é explícito no documento emitido', () => {
  test('toda a designação está preenchida e é legível', ({ assert }) => {
    for (const tipo of TIPOS_DE_DOCUMENTO_VALIDOS) {
      const designacao = designacaoDe(tipo)

      assert.isNotEmpty(designacao, `"${tipo}" não tem designação para imprimir`)
      assert.isAtLeast(designacao.length, 6, `a designação de "${tipo}" é curta de mais`)
      assert.notMatch(
        designacao,
        /^[A-Z]{2}$/,
        `a designação de "${tipo}" é um código, e o que se imprime tem de ser por extenso`
      )
    }
  })

  /**
   * As chaves internas são nomes de gaveta; as designações são o que a lei manda
   * constar do documento. `'Outros Recibos'` imprime-se «Recibo» — e é por isso
   * que quem imprime tem de ler `designacao` e nunca `tipo`.
   */
  test('a designação pode diferir da chave interna', ({ assert }) => {
    assert.equal(designacaoDe('Outros Recibos'), 'Recibo')
    assert.equal(designacaoDe('Autofacturação'), 'Factura-Recibo de Autofacturação')
    assert.equal(designacaoDe('Estorno'), 'Recibo de Estorno')
  })

  test('a factura genérica não se apresenta como factura simples', ({ assert }) => {
    assert.equal(designacaoDe('Factura Genérica'), 'Factura Genérica')
    assert.notEqual(designacaoDe('Factura Genérica'), designacaoDe('Factura'))
    // Comunica-se à AGT como FT: o Blueprint não lhe dá código próprio.
    assert.equal(TIPOS_DE_DOCUMENTO['Factura Genérica'].codigo, 'FT')
  })
})

test.group('numeração — séries e referências', () => {
  /**
   * O `seriesCode` do Blueprint: alfanumérico, entre 3 e 60 caracteres, contendo
   * o ano. Uma série que não passe aqui é recusada com E33 — do outro lado da
   * rede, depois de o documento já existir.
   */
  test('a série por omissão é um seriesCode válido', ({ assert }) => {
    for (const tipo of TIPOS_DE_DOCUMENTO_VALIDOS) {
      const serie = serieDefault(tipo, 2026)

      assert.match(serie, /^[A-Za-z0-9]+$/, `"${serie}" não é alfanumérica`)
      assert.isAtLeast(serie.length, 3)
      assert.isAtMost(serie.length, 60)
      assert.include(serie, '2026', `"${serie}" não contém o ano`)
    }
  })

  /**
   * O art.º 10.º exige numeração sequencial POR TIPO. Duas séries por omissão
   * iguais para tipos diferentes fariam os dois partilhar contador — que é
   * exactamente o defeito que esta passagem corrigiu.
   *
   * A factura genérica é a excepção deliberada: partilha o código `FT` com a
   * factura simples porque a AGT não lhe dá outro, e portanto partilha a série.
   */
  test('tipos com códigos diferentes nunca partilham série', ({ assert }) => {
    const porSerie = new Map<string, FacturaTipo[]>()

    for (const tipo of TIPOS_DE_DOCUMENTO_VALIDOS) {
      const serie = serieDefault(tipo, 2026)
      porSerie.set(serie, [...(porSerie.get(serie) ?? []), tipo])
    }

    for (const [serie, tipos] of porSerie) {
      if (tipos.length === 1) continue

      const codigos = new Set(tipos.map((t) => TIPOS_DE_DOCUMENTO[t].codigo))
      assert.equal(
        codigos.size,
        1,
        `a série "${serie}" é partilhada por tipos com códigos diferentes: ${tipos.join(', ')}`
      )
    }
  })

  /**
   * `documentNo` no formato do SAF-T(AO), com o mínimo de 8 caracteres que o
   * Blueprint declara (1.1.2.4): `FT ABC/1` são exactamente 8.
   */
  test('a referência tem o formato do documentNo da AGT', ({ assert }) => {
    assert.equal(referenciaDe('Factura', 'FT2026', 1), 'FT FT2026/1')
    assert.equal(referenciaDe('Nota de Crédito', 'NC2026', 14), 'NC NC2026/14')
    assert.equal(referenciaDe('Outros Recibos', 'RG2026', 7), 'RG RG2026/7')

    for (const tipo of TIPOS_DE_DOCUMENTO_VALIDOS) {
      const referencia = referenciaDe(tipo, serieDefault(tipo, 2026), 1)

      assert.match(referencia, /^[A-Z]{2} [A-Za-z0-9]{3,60}\/\d+$/, referencia)
      assert.isAtLeast(referencia.length, 8, `"${referencia}" é mais curta que o mínimo`)
    }
  })

  /**
   * Duas facturas com o número 14 em séries diferentes são dois documentos, e a
   * referência tem de os distinguir. É por isto que o que identifica um documento
   * é a referência, e nunca o `numero` sozinho.
   */
  test('o mesmo número em séries diferentes dá referências diferentes', ({ assert }) => {
    assert.notEqual(
      referenciaDe('Factura', 'FT2026', 14),
      referenciaDe('Nota de Crédito', 'NC2026', 14)
    )
  })

  /**
   * O inverso, e o defeito que este teste existe para impedir.
   *
   * `Factura` e `Factura Genérica` são dois tipos INTERNOS com o mesmo código da
   * AGT, e portanto com a mesma série por omissão. Se o contador fosse por tipo,
   * os dois primeiros documentos sairiam ambos como `FT FT2026/1` — o mesmo
   * `documentNo` para dois documentos diferentes.
   *
   * Daí a chave da numeração (e o índice único `factura_numeracao_unique`) serem
   * `(empresa, série, ano, número)`, sem o tipo: tipos que partilham a série têm
   * de partilhar o contador.
   */
  test('tipos que partilham a série produzem a MESMA referência para o mesmo número', ({
    assert,
  }) => {
    assert.equal(serieDefault('Factura', 2026), serieDefault('Factura Genérica', 2026))
    assert.equal(
      referenciaDe('Factura', 'FT2026', 1),
      referenciaDe('Factura Genérica', 'FT2026', 1),
      'os dois tipos partilham série e código: só um deles pode ficar com o número 1'
    )
  })
})

test.group('as listas derivadas concordam com a tabela', () => {
  test('cada lista contém exactamente os tipos com a respectiva marca', ({ assert }) => {
    const pares = [
      ['exigeVenda', TIPOS_QUE_EXIGEM_VENDA],
      ['exigeOrigem', TIPOS_QUE_EXIGEM_ORIGEM],
      ['exigePeriodo', TIPOS_QUE_EXIGEM_PERIODO],
      ['eRecibo', TIPOS_DE_RECIBO],
    ] as const

    for (const [marca, lista] of pares) {
      const esperados = TIPOS_DE_DOCUMENTO_VALIDOS.filter(
        (tipo) => TIPOS_DE_DOCUMENTO[tipo][marca]
      )
      assert.deepEqual(
        [...lista].sort(),
        [...esperados].sort(),
        `a lista de "${marca}" divergiu da tabela`
      )
    }
  })

  /**
   * Um tipo que exige venda e período ao mesmo tempo não é satisfazível: a
   * factura global cobre várias vendas, e nenhuma delas é "a" venda do documento.
   */
  test('nenhum tipo exige simultaneamente venda e período', ({ assert }) => {
    for (const tipo of TIPOS_DE_DOCUMENTO_VALIDOS) {
      const definicao = TIPOS_DE_DOCUMENTO[tipo]
      assert.isFalse(
        definicao.exigeVenda && definicao.exigePeriodo,
        `"${tipo}" exige venda e período ao mesmo tempo`
      )
    }
  })

  /**
   * Um recibo não descreve artigos, e por isso não pode ser exigido que traga uma
   * venda: o que ele traz é o documento que regularizou.
   */
  test('nenhum recibo exige venda', ({ assert }) => {
    for (const tipo of TIPOS_DE_RECIBO) {
      assert.isFalse(TIPOS_DE_DOCUMENTO[tipo].exigeVenda, `"${tipo}" é recibo e exige venda`)
    }
  })
})
