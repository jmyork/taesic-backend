/**
 * `validacao/formatos.ts` — números de telemóvel e aritmética de dinheiro.
 *
 * Estes testes não tocam na rede nem no simulador. São as funções que decidem se
 * um pedido chega a sair, e a maior parte dos erros que este módulo evita são
 * erros que acontecem aqui.
 */

import { test } from '@japa/runner'
import {
  arredondar,
  eMsisdn,
  eMsisdnAngolano,
  eReferenciaExterna,
  emUnidadesMenores,
  formatarMontante,
  montantesIguais,
  normalizarMsisdn,
  somar,
} from '../validacao/formatos.js'

test.group('normalizarMsisdn', () => {
  test('aceita as formas em que as pessoas escrevem um número', ({ assert }) => {
    // Nenhum operador de caixa escreve `244923456789`. Escreve o que está no
    // papel, e o que está no papel tem espaços.
    for (const escrito of [
      '923456789',
      '923 456 789',
      '+244923456789',
      '+244 923 456 789',
      '00244923456789',
      '(244) 923-456-789',
      '244 923 456 789',
    ]) {
      assert.equal(normalizarMsisdn(escrito, '244'), '244923456789', `falhou para "${escrito}"`)
    }
  })

  test('devolve null em vez de inventar um número', ({ assert }) => {
    // Devolver `null` é o ponto: enviar um número mal formado gasta uma chamada
    // para receber INVALID_MSISDN_FORMAT, com o cliente à espera.
    for (const lixo of ['', '   ', 'abc', '12', null, undefined, 42]) {
      assert.isNull(normalizarMsisdn(lixo as any, '244'))
    }
  })

  test('não duplica o indicativo de um número que já o traz', ({ assert }) => {
    assert.equal(normalizarMsisdn('244923456789', '244'), '244923456789')
  })

  test('serve outros indicativos', ({ assert }) => {
    assert.equal(normalizarMsisdn('912345678', '351'), '351912345678')
  })
})

test.group('eMsisdn / eMsisdnAngolano', () => {
  test('eMsisdn aceita só dígitos, sem +', ({ assert }) => {
    assert.isTrue(eMsisdn('244923456789'))
    assert.isFalse(eMsisdn('+244923456789'))
    assert.isFalse(eMsisdn('244 923 456 789'))
  })

  test('eMsisdnAngolano exige 244 e nove dígitos começados por 9', ({ assert }) => {
    assert.isTrue(eMsisdnAngolano('244923456789'))
    assert.isFalse(eMsisdnAngolano('244123456789'))
    assert.isFalse(eMsisdnAngolano('351912345678'))
  })
})

test.group('eReferenciaExterna', () => {
  test('recusa vazia e recusa acima de 120 caracteres', ({ assert }) => {
    assert.isFalse(eReferenciaExterna(''))
    assert.isFalse(eReferenciaExterna('   '))
    assert.isTrue(eReferenciaExterna('ENC-2026-001'))
    assert.isTrue(eReferenciaExterna('A'.repeat(120)))
    assert.isFalse(eReferenciaExterna('A'.repeat(121)))
  })
})

test.group('dinheiro', () => {
  test('arredondar acerta nos casos que o Math.round erra', ({ assert }) => {
    // `Math.round(1.005 * 100) / 100` dá 1, porque o que está na memória é
    // 1.00499999999999989.
    assert.equal(arredondar(1.005, 2), 1.01)
    assert.equal(arredondar(2.675, 2), 2.68)
    assert.equal(arredondar(1500, 2), 1500)
  })

  test('montantesIguais compara em cêntimos e não em vírgula flutuante', ({ assert }) => {
    // `0.1 + 0.2 === 0.3` é falso. Um carrinho com três linhas de 0,1 chega lá
    // sozinho.
    assert.isFalse(0.1 + 0.2 === 0.3)
    assert.isTrue(montantesIguais(0.1 + 0.2, 0.3, 2))
  })

  test('montantesIguais tolera uma unidade menor, e só uma', ({ assert }) => {
    assert.isTrue(montantesIguais(100.0, 100.01, 2))
    assert.isFalse(montantesIguais(100.0, 100.02, 2))
  })

  test('somar arredonda uma vez, no fim', ({ assert }) => {
    assert.equal(somar([0.1, 0.1, 0.1], 2), 0.3)
    assert.equal(somar([1.005, 1.005], 2), 2.01)
    assert.equal(somar([null, undefined, 5], 2), 5)
  })

  test('emUnidadesMenores dá um inteiro', ({ assert }) => {
    assert.equal(emUnidadesMenores(1500, 2), 150_000)
    assert.equal(emUnidadesMenores(0.1 + 0.2, 2), 30)
  })

  test('formatarMontante usa a vírgula portuguesa', ({ assert }) => {
    assert.equal(formatarMontante(1500, 2), '1500,00')
    assert.equal(formatarMontante(0.1 + 0.2, 2), '0,30')
  })
})
