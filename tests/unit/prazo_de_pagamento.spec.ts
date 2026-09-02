import { test } from '@japa/runner'
import { DateTime } from 'luxon'

import {
  DIAS_DE_PRE_AVISO,
  PRAZO_PAGAMENTO_MAXIMO_DIAS,
  PRAZO_PAGAMENTO_PADRAO_DIAS,
  avisoDevidoHoje,
  avisoJaEmitido,
  vencimentoA,
} from '../../app/helpers/prazo_de_pagamento.js'

/**
 * O calendário das cobranças, testado sem base de dados.
 *
 * ── Porque é que estes testes são unitários ─────────────────────────────────
 *
 * Porque a pergunta é sobre DATAS, e exercitá-la através da base de dados
 * obrigaria a inventar uma empresa, uma venda e uma factura por cada caso — e a
 * esperar que o relógio do servidor colaborasse. Aqui o «hoje» é um argumento, e
 * portanto os casos de fronteira (o dia exacto do pré-aviso, o dia do vencimento,
 * o dia seguinte) são escritos em vez de simulados.
 *
 * A parte que precisa da base de dados — que avisos já saíram sobre uma factura —
 * está em `AvisoCobrancaRepository` e é testada à parte.
 */
test.group('prazo de pagamento — as constantes', () => {
  test('o padrão nunca ultrapassa o tecto', ({ assert }) => {
    assert.isAtMost(
      PRAZO_PAGAMENTO_PADRAO_DIAS,
      PRAZO_PAGAMENTO_MAXIMO_DIAS,
      'uma empresa que não configurou nada não pode nascer acima do tecto legal'
    )
  })

  test('o pré-aviso cabe dentro do prazo padrão', ({ assert }) => {
    assert.isBelow(
      DIAS_DE_PRE_AVISO,
      PRAZO_PAGAMENTO_PADRAO_DIAS,
      'senão o aviso preventivo cairia antes da própria emissão da factura'
    )
  })
})

test.group('prazo de pagamento — a data de vencimento', () => {
  test('conta a partir do INÍCIO do dia da emissão', ({ assert }) => {
    /*
     * A hora não pode entrar na conta. Uma factura emitida às 23h50 e outra às
     * 08h00 do mesmo dia, ambas a 30 dias, vencem no mesmo dia — e se o
     * vencimento fosse um instante, a primeira venceria quase um dia depois da
     * segunda por causa de um pormenor de relógio.
     */
    const tarde = DateTime.fromISO('2026-09-02T23:50:00')
    const cedo = DateTime.fromISO('2026-09-02T08:00:00')

    assert.equal(vencimentoA(30, tarde).toISODate(), vencimentoA(30, cedo).toISODate())
    assert.equal(vencimentoA(30, cedo).toISODate(), '2026-10-02')
  })
})

test.group('prazo de pagamento — que aviso é devido hoje', () => {
  const vencimento = DateTime.fromISO('2026-10-02')

  test('sete dias antes sai o pré-aviso', ({ assert }) => {
    assert.equal(avisoDevidoHoje(vencimento, DateTime.fromISO('2026-09-25')), 'pre_aviso')
  })

  test('no dia do vencimento sai o aviso de cobrança', ({ assert }) => {
    assert.equal(avisoDevidoHoje(vencimento, DateTime.fromISO('2026-10-02')), 'vencimento')
  })

  test('entre os dois não sai nada', ({ assert }) => {
    /*
     * O caso que este teste protege é o de um aviso por cada dia de atraso: uma
     * inundação de documentos fiscais em vez de uma cobrança. São dois momentos, e
     * só dois.
     */
    for (const dia of ['2026-09-26', '2026-09-28', '2026-10-01']) {
      assert.isNull(avisoDevidoHoje(vencimento, DateTime.fromISO(dia)), `saiu aviso a ${dia}`)
    }
  })

  test('antes da janela de pré-aviso não sai nada', ({ assert }) => {
    assert.isNull(avisoDevidoHoje(vencimento, DateTime.fromISO('2026-09-24')))
  })

  /**
   * A rede que apanha um agendamento que não correu.
   *
   * O comando corre por cron externo, e este projecto já foi mordido por um que
   * nunca foi instalado (§7.27). Uma factura que venceu ontem e nunca foi avisada
   * tem de ser avisada hoje — senão a dívida passa o seu dia sem nada e nunca mais
   * é reclamada.
   */
  test('uma factura já vencida continua a pedir o aviso do vencimento', ({ assert }) => {
    assert.equal(avisoDevidoHoje(vencimento, DateTime.fromISO('2026-10-09')), 'vencimento')
  })

  /**
   * O caso limite que não é omissão, é a única leitura possível: não se avisa que
   * falta uma semana para pagar uma factura emitida há três dias.
   */
  test('um prazo curto nunca tem pré-aviso, só o do vencimento', ({ assert }) => {
    const emissao = DateTime.fromISO('2026-09-02')
    const vence = vencimentoA(5, emissao)

    for (let dia = 0; dia <= 5; dia++) {
      const hoje = emissao.plus({ days: dia })
      const momento = avisoDevidoHoje(vence, hoje)
      assert.notEqual(momento, 'pre_aviso', `saiu pré-aviso ao dia ${dia} de um prazo de 5`)
    }

    assert.equal(avisoDevidoHoje(vence, emissao.plus({ days: 5 })), 'vencimento')
  })
})

test.group('prazo de pagamento — o aviso já saiu?', () => {
  const vencimento = DateTime.fromISO('2026-10-02')

  test('sem avisos anteriores, nenhum dos dois saiu', ({ assert }) => {
    assert.isFalse(avisoJaEmitido('pre_aviso', vencimento, []))
    assert.isFalse(avisoJaEmitido('vencimento', vencimento, []))
  })

  /**
   * A distinção inteira, e é o que substitui uma coluna de estado: um aviso
   * emitido ANTES do vencimento é o pré-aviso; a partir dele, é o do vencimento.
   */
  test('um aviso emitido antes do vencimento é o pré-aviso, e só ele', ({ assert }) => {
    const anteriores = [DateTime.fromISO('2026-09-25')]

    assert.isTrue(avisoJaEmitido('pre_aviso', vencimento, anteriores))
    assert.isFalse(
      avisoJaEmitido('vencimento', vencimento, anteriores),
      'o pré-aviso não pode consumir o aviso do vencimento — a dívida ficaria sem cobrança'
    )
  })

  test('um aviso emitido no dia do vencimento é o do vencimento', ({ assert }) => {
    const anteriores = [DateTime.fromISO('2026-10-02')]

    assert.isTrue(avisoJaEmitido('vencimento', vencimento, anteriores))
    assert.isFalse(avisoJaEmitido('pre_aviso', vencimento, anteriores))
  })

  test('com os dois já emitidos, não sai mais nenhum', ({ assert }) => {
    const anteriores = [DateTime.fromISO('2026-09-25'), DateTime.fromISO('2026-10-02')]

    assert.isTrue(avisoJaEmitido('pre_aviso', vencimento, anteriores))
    assert.isTrue(avisoJaEmitido('vencimento', vencimento, anteriores))
  })

  /** A hora não conta: o que separa os dois é o DIA, não o instante. */
  test('um aviso emitido ao fim do dia do vencimento continua a ser o do vencimento', ({
    assert,
  }) => {
    const anteriores = [DateTime.fromISO('2026-10-02T23:59:00')]

    assert.isTrue(avisoJaEmitido('vencimento', vencimento, anteriores))
    assert.isFalse(avisoJaEmitido('pre_aviso', vencimento, anteriores))
  })
})
