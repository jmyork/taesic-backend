import { DateTime } from 'luxon'
import Factura from '#models/faturacao/factura'
import FacturaRepository from './factura_repository.js'
import { TIPOS_QUE_LIQUIDAM } from '../helpers/regras_de_emissao.js'
import {
  type MomentoDoAviso,
  avisoDevidoHoje,
  avisoJaEmitido,
} from '../helpers/prazo_de_pagamento.js'

/**
 * Os avisos de cobrança que hoje têm de sair.
 *
 * ── O que este ficheiro decide, e o que não decide ──────────────────────────
 *
 * Não decide QUANDO. Isso está em `app/helpers/prazo_de_pagamento.ts`, puro e
 * testável sem base de dados: sete dias antes do vencimento, e outra vez no dia
 * limite. Aqui está só a parte que precisa de saber o que já existe gravado.
 *
 * A divisão importa porque a regra dos dois momentos é a que muda quando o dono do
 * produto mudar de ideias, e a que tem de poder ser exercitada com um calendário
 * fabricado — sem inventar uma empresa, uma venda e uma factura para cada caso.
 *
 * ── Porque é que não há coluna de «aviso já enviado» ────────────────────────
 *
 * Porque haveria dois sítios a ter de concordar, e o dia em que um caminho de
 * emissão se esquecesse de marcar a coluna, a factura levava dois avisos iguais —
 * ou nenhum. Os avisos que já existem estão gravados como documentos, com a sua
 * data de emissão, e é dela que se lê qual deles já saiu: emitido ANTES do
 * vencimento é o pré-aviso, a partir dele é o aviso do vencimento.
 */
export default class AvisoCobrancaRepository {
  /**
   * Emite os avisos devidos hoje, em toda a plataforma ou numa empresa.
   *
   * Devolve o que fez, por documento — quem corre isto num agendamento precisa de
   * uma linha por aviso para poder responder a «porque é que este cliente recebeu
   * uma cobrança?» três semanas depois.
   */
  async emitirDevidos(opcoes: { company_alias?: string; hoje?: DateTime } = {}) {
    const hoje = opcoes.hoje ?? DateTime.now()

    /*
     * As facturas ainda em dívida — as que têm vencimento, não estão anuladas, e
     * não têm recibo por cima. É a mesma definição de `estaEmDivida()` que o mapa
     * de cobranças usa; se as duas divergirem, cobra-se o que já está pago.
     *
     * `empresa` entra por join só para o filtro por inquilino e para o relato: sem
     * o alias, a linha de log diz «FT FT2026/14» sem dizer de quem.
     */
    const candidatas = await Factura.query()
      .join('empresa', 'empresa.id', 'factura.empresa_id')
      .if(Boolean(opcoes.company_alias), (q) =>
        q.where('empresa.company_alias', opcoes.company_alias!)
      )
      .whereNotNull('factura.data_vencimento')
      .whereNot('factura.status', 'anulada')
      .whereNull('factura.deleted_at')
      .whereNotExists((q) =>
        q
          .from('factura as recibo')
          .whereRaw('recibo.documento_origem_id = factura.id')
          .whereIn('recibo.tipo', [...TIPOS_QUE_LIQUIDAM])
          .whereNot('recibo.status', 'anulada')
          .whereNull('recibo.deleted_at')
      )
      .select('factura.*', 'empresa.company_alias as company_alias')
      .orderBy('factura.data_vencimento', 'asc')

    const emitidos: {
      factura_id: string
      referencia: string | null
      momento: MomentoDoAviso
      aviso_referencia: string | null
    }[] = []

    const falhas: { factura_id: string; erro: string }[] = []

    for (const factura of candidatas) {
      const vencimento = factura.data_vencimento
      if (!vencimento) continue

      const momento = avisoDevidoHoje(vencimento, hoje)
      if (!momento) continue

      /*
       * Os avisos que já saíram sobre esta factura. Só os NÃO anulados contam —
       * anular um aviso existe precisamente para se poder emitir outro depois de um
       * erro, e um aviso anulado a bloquear o seguinte deixaria a dívida sem
       * cobrança nenhuma.
       */
      const anteriores = await Factura.query()
        .where('documento_origem_id', factura.id)
        .where('tipo', 'Aviso de Cobrança')
        .whereNot('status', 'anulada')
        .whereNull('deleted_at')
        .select('data_emissao')

      if (avisoJaEmitido(momento, vencimento, anteriores.map((a) => a.data_emissao))) {
        continue
      }

      /*
       * Uma falha numa factura não pode parar as outras.
       *
       * Este método corre num agendamento sobre a plataforma inteira: uma empresa
       * com dados estranhos — uma série mal formada, uma nota de crédito que já
       * esgotou o valor — deixaria todos os clientes seguintes sem cobrança
       * nenhuma, e ninguém daria por isso até alguém perguntar por que é que
       * ninguém foi avisado. Fica registada e o ciclo segue.
       */
      try {
        /*
         * Sem `emitido_por_user_id`: este documento não foi emitido por ninguém.
         * Nasceu de um prazo que passou, na varredura diária, e atribuí-lo a uma
         * pessoa seria pôr o nome de alguém debaixo de um acto que essa pessoa não
         * praticou. Quem lê mostra "Sistema".
         */
        const aviso = await new FacturaRepository().emitir({
          company_alias: factura.$extras.company_alias,
          tipo: 'Aviso de Cobrança',
          documento_origem_id: factura.id,
          total: Number(factura.total),
          observacoes:
            momento === 'pre_aviso'
              ? `Aviso preventivo: o pagamento de ${factura.referencia} vence a ${vencimento.toFormat('dd/MM/yyyy')}.`
              : `O pagamento de ${factura.referencia} venceu a ${vencimento.toFormat('dd/MM/yyyy')}.`,
        })

        emitidos.push({
          factura_id: factura.id,
          referencia: factura.referencia,
          momento,
          aviso_referencia: aviso.referencia,
        })
      } catch (erro: any) {
        falhas.push({ factura_id: factura.id, erro: erro?.message ?? String(erro) })
      }
    }

    return { emitidos, falhas, candidatas: candidatas.length }
  }
}
