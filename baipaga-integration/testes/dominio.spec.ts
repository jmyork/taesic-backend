/**
 * `dominio/estados.ts` e `dominio/codigos_resposta.ts`.
 *
 * São tabelas — e uma tabela testa-se mal, porque um teste que repete a tabela
 * não prova nada. O que está aqui são as CONSEQUÊNCIAS das tabelas: as perguntas
 * que o código de vendas faz, e cuja resposta errada custa dinheiro nos dois
 * sentidos.
 */

import { test } from '@japa/runner'
import {
  descreverEstado,
  ESTADOS_FINAIS,
  ESTADOS_PAGAMENTO,
  ESTADOS_PENDENTES,
  estadoConfirmaQueNadaFoiCobrado,
  estadoEFinal,
  estadoEPendente,
  estadoLiquidou,
  podeEntregar,
} from '../dominio/estados.js'
import {
  CODIGOS_RESPOSTA,
  descrever,
  DESCRICOES,
  eSucesso,
  eTransitorio,
  EXIGE_CONSULTA_ANTES_DE_REPETIR,
  mensagemParaUtilizador,
} from '../dominio/codigos_resposta.js'

test.group('estados — a pergunta que custa dinheiro', () => {
  test('só SUCCESS autoriza entregar a mercadoria', ({ assert }) => {
    for (const estado of Object.keys(ESTADOS_PAGAMENTO)) {
      assert.equal(
        podeEntregar(estado),
        estado === 'SUCCESS',
        `${estado} não pode decidir uma entrega`
      )
    }
  })

  test('ACCEPTED não é SUCCESS', ({ assert }) => {
    // ACCEPTED diz que o cliente autorizou; SUCCESS diz que o dinheiro saiu da
    // conta dele. Uma autorização ainda pode falhar no core banking.
    assert.isFalse(estadoLiquidou('ACCEPTED'))
    assert.isTrue(estadoLiquidou('SUCCESS'))
  })

  test('PARTIAL_REVERSED não conta como liquidado', ({ assert }) => {
    // Entrou e saiu uma parte. Quem quer saber quanto tem de olhar para
    // `totalReversed`, não para um booleano.
    assert.isFalse(estadoLiquidou('PARTIAL_REVERSED'))
  })

  test('TIMEOUT e UNKNOWN não confirmam que nada foi cobrado', ({ assert }) => {
    // É a assimetria que faz perder dinheiro: "não deu SUCCESS" não é o mesmo
    // que "não foi cobrado".
    assert.isFalse(estadoConfirmaQueNadaFoiCobrado('TIMEOUT'))
    assert.isFalse(estadoConfirmaQueNadaFoiCobrado('UNKNOWN'))
    assert.isFalse(estadoConfirmaQueNadaFoiCobrado('PROCESSING'))

    for (const estado of ['REJECTED', 'EXPIRED', 'CANCELED', 'ERROR']) {
      assert.isTrue(estadoConfirmaQueNadaFoiCobrado(estado))
    }
  })

  test('UNKNOWN é pendente, para se voltar a perguntar', ({ assert }) => {
    // "Não sei" inclui "pago". Tratá-lo como falha liberta o cliente sem cobrar.
    assert.isTrue(estadoEPendente('UNKNOWN'))
    assert.isFalse(estadoEFinal('UNKNOWN'))
  })

  test('nenhum estado é final e pendente ao mesmo tempo', ({ assert }) => {
    for (const estado of ESTADOS_PENDENTES) {
      assert.isFalse(estadoEFinal(estado), `${estado} está nas duas listas`)
    }
    for (const estado of ESTADOS_FINAIS) {
      assert.isFalse(estadoEPendente(estado), `${estado} está nas duas listas`)
    }
  })

  test('os quinze estados da especificação estão classificados', ({ assert }) => {
    // Um estado que não seja nem final nem pendente deixa `esperarDesfecho()`
    // a sondar para sempre.
    const classificados = new Set([...ESTADOS_FINAIS, ...ESTADOS_PENDENTES])
    for (const estado of Object.keys(ESTADOS_PAGAMENTO)) {
      assert.isTrue(classificados.has(estado as any), `${estado} não está classificado`)
    }
  })

  test('um estado que o BAI invente tem sempre uma frase', ({ assert }) => {
    // A enumeração deles pode crescer sem nos avisar, e um ecrã em branco é pior
    // do que "estado não reconhecido".
    assert.equal(descreverEstado('ALGO_NOVO'), 'Estado não reconhecido')
    assert.equal(descreverEstado('SUCCESS'), 'Pago')
  })
})

test.group('códigos de resposta', () => {
  test('todos os dezassete têm descrição técnica', ({ assert }) => {
    for (const codigo of CODIGOS_RESPOSTA) {
      assert.isString(DESCRICOES[codigo])
      assert.isAbove(DESCRICOES[codigo].length, 10, `${codigo} sem descrição útil`)
    }
  })

  test('eSucesso aceita as duas formas do campo (#C-01)', ({ assert }) => {
    // Declarado como enumeração de texto, descrito como número. Aceitamos as
    // duas leituras porque as duas cabem no que a especificação diz de si.
    assert.isTrue(eSucesso('OK'))
    assert.isTrue(eSucesso(0))
    assert.isTrue(eSucesso('0'))

    assert.isFalse(eSucesso('FATAL'))
    assert.isFalse(eSucesso(undefined))
    assert.isFalse(eSucesso(null))
    assert.isFalse(eSucesso(''))
  })

  test('um código desconhecido não recebe uma frase inventada', ({ assert }) => {
    assert.include(descrever('CODIGO_QUE_NAO_EXISTE'), 'não previsto na especificação')
  })

  test('só o que é mesmo transitório vale a pena repetir', ({ assert }) => {
    assert.isTrue(eTransitorio('CORE_BANKING_UNAVAILABLE'))
    assert.isTrue(eTransitorio('FATAL'))
    assert.isTrue(eTransitorio('UNKNOWN'))

    // Repetir aqui é a definição do problema.
    assert.isFalse(eTransitorio('MAX_FAILED_RETRIES_REACHED'))
    // E aqui é repetir com o mesmo conteúdo para ter o mesmo erro.
    assert.isFalse(eTransitorio('INVALID_MSISDN'))
    assert.isFalse(eTransitorio('INVALID_API_KEY'))
  })

  test('EXISTING_EXTERNAL_REFERENCE obriga a consultar antes de repetir', ({ assert }) => {
    // A leitura mais provável é que o pedido ANTERIOR passou. Repetir com uma
    // referência nova cria um segundo pagamento e cobra o cliente duas vezes.
    assert.include(EXIGE_CONSULTA_ANTES_DE_REPETIR, 'EXISTING_EXTERNAL_REFERENCE')
  })
})

test.group('mensagens para o utilizador', () => {
  test('nenhuma expõe a estrutura do sistema', ({ assert }) => {
    // Regra do projecto: português, linguagem de negócio, e nada sobre como o
    // sistema é feito. O operador não pode fazer nada com o detalhe técnico, e o
    // detalhe está no registo, onde serve.
    const proibido = /api|key|chave|token|endpoint|http|json|core banking|msisdn|payload/i

    for (const codigo of CODIGOS_RESPOSTA) {
      const mensagem = mensagemParaUtilizador(codigo)
      assert.notMatch(mensagem, proibido, `"${mensagem}" (${codigo}) expõe o sistema`)
    }
  })

  test('todas estão em português e terminam em ponto', ({ assert }) => {
    for (const codigo of CODIGOS_RESPOSTA) {
      const mensagem = mensagemParaUtilizador(codigo)
      assert.isAbove(mensagem.length, 10)
      assert.match(mensagem, /\.$/, `"${mensagem}" (${codigo})`)
    }
  })

  test('os erros de configuração recebem todos a mesma frase genérica', ({ assert }) => {
    const generica = mensagemParaUtilizador('INVALID_API_KEY')

    assert.equal(mensagemParaUtilizador('UNAUTHORIZED'), generica)
    assert.equal(mensagemParaUtilizador('INVALID_PARAMETERS'), generica)
    assert.equal(mensagemParaUtilizador('CODIGO_QUE_O_BAI_INVENTE'), generica)
    assert.include(generica, 'suporte')
  })

  test('os erros accionáveis dizem ao operador o que fazer', ({ assert }) => {
    assert.match(mensagemParaUtilizador('CUSTOMER_NOT_FOUND_FOR_MSISDN'), /confirme o número/i)
    assert.match(mensagemParaUtilizador('INVALID_MSISDN_FORMAT'), /confirme o número/i)
    assert.match(mensagemParaUtilizador('CORE_BANKING_UNAVAILABLE'), /tente/i)
    assert.match(mensagemParaUtilizador('EXISTING_EXTERNAL_REFERENCE'), /consulte o estado/i)
    assert.match(mensagemParaUtilizador('SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT'), /reveja/i)
  })
})
