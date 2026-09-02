import { DateTime } from 'luxon'

/**
 * O prazo de pagamento de uma factura a crédito — o tecto, o padrão, e os avisos.
 *
 * ── Um sítio só, porque são três coisas que têm de concordar ─────────────────
 *
 * O tecto entra no validator, o padrão entra na migração de `empresa` e no fecho
 * da venda, e os momentos de aviso entram no comando que os emite. Escritos em
 * três ficheiros, divergiriam — e a divergência apareceria como uma factura
 * aceite com um prazo que o aviso de cobrança nunca chega a cobrir.
 */

/**
 * O prazo máximo, em dias, para uma factura a pagamento futuro.
 *
 * ⚠️ **É um tecto de configuração, não uma citação de um artigo.** Foi fixado em
 * 30 dias por decisão do dono do produto. Não está aqui nenhuma referência legal
 * porque nenhuma foi verificada — e escrever «art.º X» ao lado de um número que
 * ninguém confirmou é pior do que não escrever nada: quem lesse a seguir tomaria
 * por assente uma coisa que não foi.
 *
 * Se o prazo legal aplicável for outro, é este número que muda, e só este.
 */
export const PRAZO_PAGAMENTO_MAXIMO_DIAS = 30

/**
 * O prazo por omissão de uma empresa que nunca configurou o seu.
 *
 * Igual ao tecto de propósito: uma empresa que não se pronunciou sobre isto não
 * deve ficar com um prazo mais apertado do que a lei lhe permite dar. Quem quiser
 * dar menos configura-o (`empresa.prazo_pagamento_dias`).
 */
export const PRAZO_PAGAMENTO_PADRAO_DIAS = PRAZO_PAGAMENTO_MAXIMO_DIAS

/**
 * Quantos dias ANTES do vencimento sai o aviso preventivo.
 *
 * Decisão do dono do produto: avisa-se sete dias antes, e outra vez no dia
 * limite. O primeiro é uma cortesia — quem se esqueceu ainda vai a tempo; o
 * segundo é a cobrança propriamente dita.
 */
export const DIAS_DE_PRE_AVISO = 7

/** Os dois momentos em que um aviso de cobrança é emitido sobre a mesma factura. */
export type MomentoDoAviso = 'pre_aviso' | 'vencimento'

/**
 * A data de vencimento de uma factura emitida hoje com este prazo.
 *
 * `startOf('day')` porque o vencimento é um DIA, não um instante: uma factura que
 * vence a 30 de Setembro vence no dia inteiro, e comparar timestamps punha-a em
 * atraso a partir da hora a que foi emitida.
 */
export function vencimentoA(prazoDias: number, emitidaEm: DateTime = DateTime.now()): DateTime {
  return emitidaEm.startOf('day').plus({ days: prazoDias })
}

/**
 * Qual dos dois avisos cabe hoje a uma factura que vence nesta data — se algum.
 *
 * ── Porque é que isto devolve o MOMENTO e não um sim/não ─────────────────────
 *
 * Porque é o momento que decide se já foi emitido. Os dois avisos são documentos
 * do mesmo tipo sobre a mesma origem, e a única coisa que os distingue é terem
 * saído antes ou depois do vencimento — é assim que
 * `avisoJaEmitido()` os separa, sem nenhuma coluna nova.
 *
 * Devolve `null` quando não é dia de nenhum: antes da janela de pré-aviso, ou nos
 * dias entre os dois. Um aviso por cada dia de atraso seria uma inundação de
 * documentos fiscais, não uma cobrança.
 *
 * O caso limite que interessa: uma factura com prazo IGUAL ou INFERIOR a sete
 * dias nunca tem pré-aviso — a janela cai antes da emissão. Não é uma omissão,
 * é a única leitura possível: não se avisa que falta uma semana para pagar uma
 * factura que foi emitida há três dias.
 */
export function avisoDevidoHoje(
  vencimento: DateTime,
  hoje: DateTime = DateTime.now()
): MomentoDoAviso | null {
  const dia = hoje.startOf('day')
  const vence = vencimento.startOf('day')

  const diasAteVencer = Math.round(vence.diff(dia, 'days').days)

  if (diasAteVencer === DIAS_DE_PRE_AVISO) return 'pre_aviso'

  /*
   * `<= 0` e não `=== 0`: o comando pode não correr um dia (a máquina esteve em
   * baixo, o agendamento falhou). Uma factura que venceu ontem e nunca foi avisada
   * tem de ser avisada hoje — a alternativa é uma dívida que passa o dia dela sem
   * nada e nunca mais é reclamada.
   */
  if (diasAteVencer <= 0) return 'vencimento'

  return null
}

/**
 * Este aviso já saiu?
 *
 * Recebe as datas de emissão dos avisos que já existem sobre a factura e o
 * vencimento dela. Um aviso emitido ANTES do vencimento é o pré-aviso; a partir
 * do vencimento, é o do vencimento.
 *
 * Deriva-se em vez de se gravar numa coluna pela mesma razão de sempre: uma
 * coluna de estado tem de ser mantida em sintonia por todos os caminhos que
 * emitem um aviso, e o dia em que um deles se esquecer, a factura leva dois
 * avisos iguais — ou nenhum.
 */
export function avisoJaEmitido(
  momento: MomentoDoAviso,
  vencimento: DateTime,
  emissoesAnteriores: DateTime[]
): boolean {
  const vence = vencimento.startOf('day')

  return emissoesAnteriores.some((emissao) => {
    const antesDoVencimento = emissao.startOf('day') < vence
    return momento === 'pre_aviso' ? antesDoVencimento : !antesDoVencimento
  })
}
