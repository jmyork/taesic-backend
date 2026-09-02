import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import caixa from '#models/caixa'
import vendas from '#models/faturacao/vendas'
import caixaRepository from './caixa_repository.js'

/** O que fica escrito na caixa e nas vendas anuladas, conforme o que despoletou o fecho. */
type MotivoDoFecho = {
  /** Acrescentado às `observacoes` da caixa. */
  observacao: string
  /** Gravado em `vendas.motivo_cancelamento` de cada venda por fechar. */
  motivoCancelamento: string
}

const FECHO_DIARIO: MotivoDoFecho = {
  observacao: 'Fecho automático diário',
  motivoCancelamento: 'Anulada no fecho automático da caixa',
}

const FECHO_DE_DIA_ANTERIOR: MotivoDoFecho = {
  observacao: 'Fecho automático da caixa deixada aberta de um dia anterior',
  motivoCancelamento: 'Anulada no fecho automático da caixa do dia anterior',
}

/**
 * Fecho das caixas que ficam abertas de um dia para o outro.
 *
 * Uma caixa que fica aberta de um dia para o outro corrompe a contabilidade do dia
 * seguinte: as vendas novas somam-se ao mesmo `total_caixa`, e uma venda que ficou aberta
 * (`status = 'aberta'`) segura a caixa para sempre — o `close()`/`destroy()` recusam
 * fechar uma caixa com venda aberta (`CaixaHasOpenVendaException`).
 *
 * Este fecho resolve as duas coisas de uma vez, e pela ordem certa: primeiro ANULA as
 * vendas que ficaram por fechar, depois fecha a caixa.
 *
 * Nota sobre as vendas anuladas: uma venda `aberta` nunca chegou a mexer no stock nem no
 * total da caixa — o stock só é debitado no `close()` da venda. Por isso anular é apenas
 * marcar `status = 'cancelada'`; não há nada a reverter. As proformas são deixadas em paz
 * de propósito: são cotações, não vendas por fechar, e não prendem a caixa.
 *
 * Há dois caminhos para cá chegar, com a mesma mecânica:
 *
 * 1. `fecharCaixasAbertas()` — o varrimento de todas as caixas, chamado pelo comando
 *    `caixa:fechar-diario` ao fim do dia.
 * 2. `fecharCaixasDeDiasAnteriores()` — a rede de segurança por utilizador, para quando
 *    o varrimento não correu (servidor em baixo, cron por instalar). Ver o comentário
 *    desse método.
 */
export default class FechoDiarioRepository {
  private queryCaixasAbertas(): ModelQueryBuilderContract<typeof caixa> {
    return caixa
      .query()
      .whereRaw('LOWER(caixa.status) = ?', ['aberto'])
      .whereNull('caixa.deleted_at')
  }

  /**
   * Todas as caixas abertas, sem olhar ao dia — o fecho ao fim do dia.
   *
   * @param referencia Momento a considerar como "agora" (útil para testar).
   */
  async fecharCaixasAbertas(referencia: DateTime = DateTime.now()) {
    const caixasAbertas = await this.queryCaixasAbertas()
    return this.fechar(caixasAbertas, referencia, FECHO_DIARIO)
  }

  /**
   * Rede de segurança: as caixas deste utilizador que foram abertas ANTES de hoje e
   * continuam abertas.
   *
   * Existe porque o fecho ao fim do dia é um trabalho externo — se não correr (servidor
   * em baixo à meia-noite, cron por instalar), a caixa de ontem continua aberta e a
   * primeira venda de hoje ia colar-se a ela: os totais de hoje somavam-se aos de ontem
   * e o dia de ontem ficava com vendas que não são dele. Por isso o mesmo fecho é feito
   * no momento em que o utilizador volta a mexer na caixa — a abrir uma, ou a tentar
   * registar uma venda.
   *
   * "De um dia anterior" é `created_at` antes do início de hoje, a mesma convenção que
   * `caixa_repository.open()` já usa para decidir se reabre a caixa de hoje. Uma caixa
   * antiga reaberta hoje à mão conta como antiga e volta a ser fechada aqui — de
   * qualquer forma o fecho ao fim do dia fecha-a na mesma nessa noite.
   *
   * NÃO abre nada em seguida, de propósito: a caixa nova é sempre aberta pelo
   * utilizador, com o posto de atendimento e o valor inicial que só ele sabe.
   */
  async fecharCaixasDeDiasAnteriores(userId: string, referencia: DateTime = DateTime.now()) {
    const caixasAbertas = await this.queryCaixasAbertas()
      .where('caixa.user_id', userId)
      .where('caixa.created_at', '<', referencia.startOf('day').toJSDate())

    return this.fechar(caixasAbertas, referencia, FECHO_DE_DIA_ANTERIOR)
  }

  private async fechar(caixasAbertas: caixa[], referencia: DateTime, motivo: MotivoDoFecho) {
    const resumo = { caixasFechadas: 0, vendasAnuladas: 0, caixas: [] as string[] }
    const caixaRepo = new caixaRepository()

    for (const registo of caixasAbertas) {
      await db.transaction(async (trx) => {
        // 1. Vendas que ficaram abertas nesta caixa.
        const abertas = await vendas
          .query({ client: trx })
          .where('caixa_id', registo.id)
          .where('status', 'aberta')
          .whereNull('deleted_at')

        for (const venda of abertas) {
          venda.status = 'cancelada'
          venda.motivo_cancelamento = motivo.motivoCancelamento
          venda.useTransaction(trx)
          await venda.save()
          resumo.vendasAnuladas++
        }

        // 2. Fechar a caixa.
        registo.merge({
          status: 'Fechado',
          data_fecho: referencia,
          observacoes: [registo.observacoes, motivo.observacao].filter(Boolean).join(' | '),
        })
        registo.useTransaction(trx)
        await registo.save()

        // 3. Os totais têm de reflectir as vendas que sobraram (as anuladas saem da conta).
        await caixaRepo.recalcularTotais(registo.id, trx)

        resumo.caixasFechadas++
        resumo.caixas.push(registo.id)
      })
    }

    return resumo
  }
}
