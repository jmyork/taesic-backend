/**
 * `assinatura/hmac.ts` — a verificação de que a resposta veio mesmo do BAI.
 *
 * É o ficheiro mais importante do módulo a testar, porque é o único cuja falha
 * não se nota: uma verificação que devolve "válida" por engano não parte nada,
 * não aparece em nenhum registo, e deixa qualquer pessoa que consiga responder
 * no lugar do BAI dizer `SUCCESS` sobre um pagamento que nunca existiu.
 *
 * Por isso metade destes testes não afirma que a assinatura certa passa — afirma
 * que as erradas NÃO passam, e que a ausência de dados nunca é lida como
 * aprovação.
 */

import { test } from '@japa/runner'
import { createHmac } from 'node:crypto'
import {
  cadeiaAssinada,
  deduzirCodificacao,
  descobrirFormato,
  FORMATOS_DE_MONTANTE,
  montantesCrusDaResposta,
  verificar,
  type CamposAssinados,
  type FormatoDeMontante,
} from '../assinatura/hmac.js'

const CHAVE = 'segredo-partilhado-de-teste'

const CAMPOS: CamposAssinados = {
  id: 987_654_321,
  nonce: 'n0nc3-de-teste',
  externalReference: 'ENC-1',
  amount: 1500,
  lastChangeDate: '2026-08-31T10:00:00Z',
  merchantExternalId: 'MERCH-TESTE',
}

/** O que o BAI faria, se escrevesse o montante desta forma. */
function assinarComo(montante: string, chave = CHAVE, codificacao: 'hex' | 'base64' = 'hex') {
  const cadeia = `987654321|n0nc3-de-teste|ENC-1|${montante}|2026-08-31T10:00:00Z|MERCH-TESTE`
  return createHmac('sha256', chave).update(cadeia, 'utf8').digest(codificacao)
}

test.group('cadeiaAssinada', () => {
  test('segue a ordem exacta da fórmula da especificação', ({ assert }) => {
    // HMAC(sharedKey, id|nonce|externalReference|amount|lastChangeDate|merchant.externalId)
    assert.equal(
      cadeiaAssinada(CAMPOS, 'montante-simples'),
      '987654321|n0nc3-de-teste|ENC-1|1500|2026-08-31T10:00:00Z|MERCH-TESTE'
    )
  })

  test('as três leituras do montante dão três cadeias diferentes', ({ assert }) => {
    // É esta a ambiguidade #A-01: `1500`, `1500.0` e `1500.00` são o mesmo
    // número e três HMAC diferentes.
    const cadeias = FORMATOS_DE_MONTANTE.map((f) => cadeiaAssinada(CAMPOS, f))
    assert.deepEqual(new Set(cadeias).size, 3)
    assert.include(cadeias[1], '|1500.0|')
    assert.include(cadeias[2], '|1500.00|')
  })

  test('campo ausente vira cadeia vazia entre separadores (#A-02)', ({ assert }) => {
    const semReferencia = cadeiaAssinada(
      { ...CAMPOS, externalReference: null, nonce: undefined },
      'montante-simples'
    )
    assert.equal(semReferencia, '987654321|||1500|2026-08-31T10:00:00Z|MERCH-TESTE')
  })
})

test.group('deduzirCodificacao', () => {
  test('distingue hexadecimal de Base64 pelo comprimento', ({ assert }) => {
    assert.equal(deduzirCodificacao('a'.repeat(64)), 'hex')
    assert.equal(deduzirCodificacao(Buffer.alloc(32).toString('base64')), 'base64')
    assert.equal(deduzirCodificacao(Buffer.alloc(32).toString('base64url')), 'base64')
  })

  test('devolve null para o que não é um HMAC-SHA256', ({ assert }) => {
    assert.isNull(deduzirCodificacao(''))
    assert.isNull(deduzirCodificacao('abc'))
    assert.isNull(deduzirCodificacao('z'.repeat(64)))
  })
})

test.group('verificar — o caso bom', () => {
  test('auto aceita qualquer uma das três leituras e diz qual foi', ({ assert }) => {
    const casos: Array<[FormatoDeMontante, string]> = [
      ['montante-simples', '1500'],
      ['montante-1-casa', '1500.0'],
      ['montante-2-casas', '1500.00'],
    ]

    for (const [formato, montante] of casos) {
      const resultado = verificar({
        assinatura: assinarComo(montante),
        campos: CAMPOS,
        chavePartilhada: CHAVE,
        canonicalizacao: 'auto',
      })

      assert.isTrue(resultado.valida, `${formato} devia passar`)
      assert.equal(resultado.formato, formato)
      assert.equal(resultado.codificacao, 'hex')
      assert.isNull(resultado.naoVerificavel)
    }
  })

  test('aceita a assinatura em Base64 sem precisar de configuração', ({ assert }) => {
    const resultado = verificar({
      assinatura: assinarComo('1500', CHAVE, 'base64'),
      campos: CAMPOS,
      chavePartilhada: CHAVE,
      canonicalizacao: 'auto',
    })

    assert.isTrue(resultado.valida)
    assert.equal(resultado.codificacao, 'base64')
  })

  test('fixada numa leitura, aceita essa e recusa as outras', ({ assert }) => {
    const fixada = verificar({
      assinatura: assinarComo('1500.00'),
      campos: CAMPOS,
      chavePartilhada: CHAVE,
      canonicalizacao: 'montante-2-casas',
    })
    assert.isTrue(fixada.valida)

    const errada = verificar({
      assinatura: assinarComo('1500'),
      campos: CAMPOS,
      chavePartilhada: CHAVE,
      canonicalizacao: 'montante-2-casas',
    })
    assert.isFalse(errada.valida)
    assert.isNull(errada.naoVerificavel, 'isto é "não bate", não é "não deu para verificar"')
  })
})

test.group('verificar — o que nunca pode passar', () => {
  test('recusa uma assinatura forjada', ({ assert }) => {
    const resultado = verificar({
      assinatura: 'f'.repeat(64),
      campos: CAMPOS,
      chavePartilhada: CHAVE,
      canonicalizacao: 'auto',
    })

    assert.isFalse(resultado.valida)
    assert.isNull(resultado.naoVerificavel)
  })

  test('recusa uma assinatura feita com outra chave', ({ assert }) => {
    const resultado = verificar({
      assinatura: assinarComo('1500', 'outra-chave'),
      campos: CAMPOS,
      chavePartilhada: CHAVE,
      canonicalizacao: 'auto',
    })

    assert.isFalse(resultado.valida)
  })

  test('recusa quando um campo assinado foi mexido', ({ assert }) => {
    // O ponto da assinatura: mudar o montante de 1500 para 15 tem de partir a
    // verificação, mesmo com a assinatura original intacta.
    const resultado = verificar({
      assinatura: assinarComo('1500'),
      campos: { ...CAMPOS, amount: 15 },
      chavePartilhada: CHAVE,
      canonicalizacao: 'auto',
    })

    assert.isFalse(resultado.valida)
  })

  test('sem chave partilhada não diz "válida" — diz que não conseguiu verificar', ({ assert }) => {
    const resultado = verificar({
      assinatura: assinarComo('1500'),
      campos: CAMPOS,
      chavePartilhada: null,
      canonicalizacao: 'auto',
    })

    assert.isFalse(resultado.valida)
    assert.isNotNull(resultado.naoVerificavel)
    assert.include(resultado.naoVerificavel!, 'BAIPAGA_CHAVE_PARTILHADA')
  })

  test('sem merchantExternalId configurado, recusa-se a verificar', ({ assert }) => {
    // Usar o que vem na resposta tornaria a verificação inútil: quem forja a
    // resposta forja também o campo.
    const resultado = verificar({
      assinatura: assinarComo('1500'),
      campos: { ...CAMPOS, merchantExternalId: '' },
      chavePartilhada: CHAVE,
      canonicalizacao: 'auto',
    })

    assert.isFalse(resultado.valida)
    assert.include(resultado.naoVerificavel!, 'merchantExternalId')
  })

  test('resposta sem assinatura não passa por verificada', ({ assert }) => {
    for (const ausente of [undefined, null, '', '   ']) {
      const resultado = verificar({
        assinatura: ausente,
        campos: CAMPOS,
        chavePartilhada: CHAVE,
        canonicalizacao: 'auto',
      })

      assert.isFalse(resultado.valida)
      assert.include(resultado.naoVerificavel!, 'assinatura')
    }
  })

  test('assinatura com forma impossível é assinalada como tal', ({ assert }) => {
    const resultado = verificar({
      assinatura: 'isto-não-é-um-hmac',
      campos: CAMPOS,
      chavePartilhada: CHAVE,
      canonicalizacao: 'auto',
    })

    assert.isFalse(resultado.valida)
    assert.include(resultado.naoVerificavel!, 'HMAC-SHA256')
  })
})

test.group('montantesCrusDaResposta', () => {
  test('recupera a grafia original que o JSON.parse deitou fora', ({ assert }) => {
    const corpo = '{"responseCode":"OK","payment":{"id":1,"amount":1500.00,"currency":"AOA"}}'

    // O que o JSON.parse deixa é 1500 — a forma perdeu-se.
    assert.equal(JSON.parse(corpo).payment.amount, 1500)
    // O que estava escrito era outra coisa.
    assert.deepEqual(montantesCrusDaResposta(corpo), ['1500.00'])
  })

  test('devolve todos os candidatos, porque "amount" aparece mais de uma vez', ({ assert }) => {
    const corpo =
      '{"payment":{"amount":1500.00,"merchant":{"transactionLimitList":[{"amount":250000.0}]}}}'

    assert.deepEqual(montantesCrusDaResposta(corpo), ['1500.00', '250000.0'])
  })

  test('serve de último recurso quando nenhuma das três leituras bate', ({ assert }) => {
    // Três casas decimais não é nenhum dos formatos previstos.
    const resultado = verificar({
      assinatura: assinarComo('1500.000'),
      campos: CAMPOS,
      chavePartilhada: CHAVE,
      canonicalizacao: 'auto',
      montantesAlternativos: montantesCrusDaResposta('{"amount":1500.000}'),
    })

    assert.isTrue(resultado.valida)
    assert.isNull(resultado.formato, 'não é nenhum dos formatos enumerados')
  })
})

test.group('descobrirFormato', () => {
  test('diz qual a leitura a fixar em BAIPAGA_CANONICALIZACAO', ({ assert }) => {
    const descoberta = descobrirFormato({
      assinatura: assinarComo('1500.0'),
      campos: CAMPOS,
      chavePartilhada: CHAVE,
    })

    assert.equal(descoberta.formato, 'montante-1-casa')
    assert.equal(descoberta.codificacao, 'hex')
    assert.lengthOf(descoberta.cadeiaExperimentada, 3)
  })

  test('devolve null quando nenhuma bate — e mostra o que experimentou', ({ assert }) => {
    const descoberta = descobrirFormato({
      assinatura: 'f'.repeat(64),
      campos: CAMPOS,
      chavePartilhada: CHAVE,
    })

    assert.isNull(descoberta.formato)
    // As cadeias servem para se mostrar ao BAI o que o nosso lado construiu.
    assert.include(descoberta.cadeiaExperimentada[0], 'MERCH-TESTE')
  })
})
