import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import caixa from '#models/caixa'
import vendas from '#models/faturacao/vendas'
import caixaRepository from './caixa_repository.js'

/**
 * Fecho diário das caixas.
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
 */
export default class FechoDiarioRepository {
  /**
   * @param referencia Momento a considerar como "agora" (útil para testar).
   */
  async fecharCaixasAbertas(referencia: DateTime = DateTime.now()) {
    const caixasAbertas = await caixa
      .query()
      .whereRaw('LOWER(caixa.status) = ?', ['aberto'])
      .whereNull('caixa.deleted_at')

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
          venda.motivo_cancelamento = 'Anulada no fecho automático da caixa'
          venda.useTransaction(trx)
          await venda.save()
          resumo.vendasAnuladas++
        }

        // 2. Fechar a caixa.
        registo.merge({
          status: 'Fechado',
          data_fecho: referencia,
          observacoes: [registo.observacoes, 'Fecho automático diário'].filter(Boolean).join(' | '),
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
