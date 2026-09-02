import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import caixa from '#models/caixa'
import vendas from '#models/faturacao/vendas'
import User from '#models/user'
import { proximoNumeroPorEmpresa } from '../helpers/sequencial_numero.js'
import { CaixaQueryDTO, CloseCaixaDTO, OpenCaixaDTO, ReOpenCaixaDTO } from '#dtos/caixa_dto'
import CaixaAlreadyOpenException from '#exceptions/caixa_already_open_exception'
import UnAuthorizedCaixaException from '#exceptions/un_authorized_caixa_exception'
import { userBelongsToPOS, userHasRole } from '../helpers/Utils.js'
import { applyCommonFilters, FieldSpec } from '../helpers/query_filters.js'
import CaixaAlreadyClosedException from '#exceptions/caixa_already_closed_exception'
import CaixaIsAlreadyOpenException from '#exceptions/caixa_is_already_open_exception'
import UserIsNotAPosWorkerException from '#exceptions/user_is_not_a_pos_worker_exception'
import CaixaHasOpenVendaException from '#exceptions/caixa_has_open_venda_exception'
import FechoDiarioRepository from './fecho_diario_repository.js'

/** Estados de venda cujo `total` já reflecte dinheiro efectivamente cobrado nesta caixa —
 * 'aberta'/'cancelada' nunca têm `total` preenchido (só é calculado no fecho). */
const STATUS_VENDA_CONTABILIZADA = ['fechada', 'reembolsada']

const CAIXA_FILTER_FIELDS: FieldSpec[] = [
  { kind: 'like', column: 'caixa.observacoes', key: 'observacoes' },
  { kind: 'exact', column: 'caixa.status', key: 'status' },
  { kind: 'exact', column: 'caixa.data_fecho', key: 'data_fecho' },
  { kind: 'range', column: 'caixa.total_vendas', startKey: 'total_vendas_start', endKey: 'total_vendas_end', exactKey: 'total_vendas' },
  { kind: 'range', column: 'caixa.valor_inicial', startKey: 'valor_inicial_start', endKey: 'valor_inicial_end', exactKey: 'valor_inicial' },
  { kind: 'range', column: 'caixa.total_caixa', startKey: 'total_caixa_start', endKey: 'total_caixa_end', exactKey: 'total_caixa' },
]

export default class caixaRepository {
  baseQuery() {
    return caixa.query()
  }

  /** Filtros partilhados por `paginate` e `listByUser` — antes duplicados linha a linha nos dois métodos. */
  private applyFilters(query: any, filter?: CaixaQueryDTO) {
    return applyCommonFilters(query, filter, { table: 'caixa', fields: CAIXA_FILTER_FIELDS })
  }

  /** Uma caixa não pode ser fechada enquanto tiver uma venda aberta associada. */
  private async assertNoVendaAberta(caixaId: string) {
    const vendaAberta = await vendas.query().where('caixa_id', caixaId).where('status', 'aberta').first()
    if (vendaAberta) {
      throw new CaixaHasOpenVendaException()
    }
  }

  /**
   * Recalcula `total_vendas`/`total_caixa` a partir das vendas actuais desta caixa — chamado
   * sempre que uma venda é fechada, cancelada, ou sofre um reembolso (total ou parcial), para
   * que os totais nunca fiquem desalinhados com o que realmente aconteceu às vendas. Soma
   * `vendas.total`, que já reflecte qualquer reembolso parcial (recalculado em
   * `produtos_reembolso_repository`) — não precisa de subtrair reembolsos à parte.
   */
  async recalcularTotais(caixaId: string, trx?: TransactionClientContract) {
    const vendasDaCaixa = await vendas
      .query(trx ? { client: trx } : undefined)
      .where('caixa_id', caixaId)
      .whereIn('status', STATUS_VENDA_CONTABILIZADA)
      .select('vendas.*')

    const totalVendas = vendasDaCaixa.reduce((soma, venda) => soma + Number(venda.total), 0)

    /*
     * ── O dinheiro em caixa deixou de ser a soma das vendas ────────────────────
     *
     * Era, e podia ser, enquanto nenhuma venda fechava sem o pagamento completo. A
     * venda a crédito acabou com isso: fecha, entra em `total_vendas`, e não põe um
     * kwanza na gaveta. Continuar a somá-la a `total_caixa` daria uma caixa a
     * declarar dinheiro que ninguém recebeu — e o fecho do dia a acusar uma falta
     * do valor exacto da venda a prazo.
     *
     * `total_vendas` fica como está: é volume de negócio, e uma venda a prazo é uma
     * venda. `total_caixa` passa a ser o dinheiro que de facto lá está.
     *
     * ── A fórmula, e porque é que é um mínimo ─────────────────────────────────
     *
     *     dinheiro retido = min(pagamentos da venda, total actual da venda)
     *
     * Parece torcido e é a única expressão que responde certo aos quatro casos —
     * verificado um a um, porque cada um deles já partiu uma versão mais simples:
     *
     *   venda a pronto     pagou 1.000, total 1.000  →  1.000   (a soma de sempre)
     *   venda a crédito    pagou     0, total 1.000  →      0   (não entrou nada)
     *   adiantamento       pagou 1.000, total 1.000  →  1.000   (entrou mesmo)
     *   reembolso parcial  pagou 1.000, total   700  →    700   (devolveu 300)
     *
     * Somar só os pagamentos falha o reembolso: as linhas de `vendapagamento`
     * ficam lá, e a caixa continuaria a declarar dinheiro que saiu pela porta.
     * Somar só `vendas.total` falha o crédito. O mínimo apanha os dois, porque um
     * reembolso reduz `vendas.total` e uma venda a prazo nunca teve pagamento.
     */
    const idsDasVendas = vendasDaCaixa.map((venda) => venda.id)

    let totalRecebido = 0

    if (idsDasVendas.length > 0) {
      const pagamentos = (await db
        .from('vendapagamento')
        .if(Boolean(trx), (q) => q.useTransaction(trx!))
        .whereIn('venda_id', idsDasVendas)
        .whereNull('deleted_at')
        .groupBy('venda_id')
        .select('venda_id')
        .sum('valor as total')) as { venda_id: string; total: string | number | null }[]

      const pagoPorVenda = new Map(pagamentos.map((p) => [p.venda_id, Number(p.total ?? 0)]))

      totalRecebido = vendasDaCaixa.reduce((soma, venda) => {
        const pago = pagoPorVenda.get(venda.id) ?? 0
        return soma + Math.min(pago, Number(venda.total))
      }, 0)
    }

    const registoCaixaQuery = caixa.query(trx ? { client: trx } : undefined)
    const registoCaixa = await registoCaixaQuery.where('caixa.id', caixaId).select('caixa.*').firstOrFail()

    registoCaixa.total_vendas = totalVendas
    registoCaixa.total_caixa = Number(registoCaixa.valor_inicial) + totalRecebido
    await registoCaixa.save()

    return registoCaixa
  }

  paginate(page = 1, limit = 20, filter?: CaixaQueryDTO) {
    let query = this.applyFilters(this.baseQuery(), filter)

    // user_id filter
    if (filter?.user_id) {
      query = query.where('caixa.user_id', filter.user_id)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .join('user', 'caixa.user_id', 'user.id')
        .join('empresa', 'empresa.id', 'user.empresa_id')
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id && !filter?.company_alias) {
      query = query
        .join('user', 'caixa.user_id', 'user.id')
        .where('user.empresa_id', filter.empresa_id)
        .where('caixa.empresa_id', filter.empresa_id)
    }
    return query.select('caixa.*').paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    let query = this.baseQuery().where('caixa.id', id)
    if (company_alias) {
      query = query
        .join('user', 'caixa.user_id', 'user.id')
        .join('empresa', 'empresa.id', 'user.empresa_id')
        .where('empresa.company_alias', company_alias)
    }
    return await query.select('caixa.*').firstOrFail()
  }

  async open(data: OpenCaixaDTO) {
    // verificar se o user é funcionário do POS indicado.
    const userIsPosWorker= await userBelongsToPOS(data.user_id,data.pos_id)
    if(!userIsPosWorker && !(await userHasRole(data.user_id!, ['Admin']))){
      throw new UserIsNotAPosWorkerException()
    }
    // Uma caixa deixada aberta de um dia anterior não pode travar a abertura da caixa de
    // hoje. Sem isto o utilizador ficava sem saída: a venda recusava por a caixa ser de
    // ontem, e abrir uma nova recusava com "já tem uma caixa aberta". Fecha-se primeiro
    // (anulando as vendas que lá ficaram por concluir) e só depois se avalia o resto.
    await new FechoDiarioRepository().fecharCaixasDeDiasAnteriores(data.user_id!)

    // verificar se tem um caixa aberto deste user
    const caixaAberto = await this.baseQuery()
      .join('user', 'caixa.user_id', 'user.id')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('caixa.status', 'Aberto')
      .where('empresa.company_alias', data.company_alias)
      .where('caixa.user_id', data.user_id)
      .select('caixa.*')
      .first()

    if (caixaAberto) {
      throw new CaixaAlreadyOpenException()
    }

    // checar o dia caixa aberto no dia de hoje
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const caixaHoje = await this.baseQuery()
      .join('user', 'caixa.user_id', 'user.id')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('caixa.status', 'Fechado')
      .where('empresa.company_alias', data.company_alias)
      .where('caixa.user_id', data.user_id)
      .where('caixa.created_at', '>=', hoje)
      .select('caixa.*')
      .first()

    if (caixaHoje?.status.toLocaleLowerCase() === 'fechado') {
      return this.reopen(caixaHoje.id,{...data})
    }

    //validar
    const { company_alias, ...caixaData } = data

    // Resolver a empresa via user.empresa_id (mesma cadeia já tratada como
    // autoritativa neste repositório, ver caixaAberto/caixaHoje acima) para a
    // numeração sequencial — fica null se o utilizador não tiver empresa (ex.:
    // Platform_Admin), caso em que a caixa também fica sem numero.
    const user = await User.findOrFail(data.user_id!)
    if (!user.empresa_id) {
      return await caixa.create({ ...caixaData, status: 'Aberto' })
    }

    return await db.transaction(async (trx) => {
      const numero = await proximoNumeroPorEmpresa(trx, user.empresa_id!, caixa)
      return caixa.create(
        { ...caixaData, status: 'Aberto', empresa_id: user.empresa_id, numero },
        { client: trx }
      )
    })
  }

  async close(id: string, data: CloseCaixaDTO) {
    const caixa = await this.findOrFail(id, data.company_alias)

    if (
      caixa.user_id !== data.user_id &&
      !(await userHasRole(data.user_id!, ['Admin', 'Gerente', 'Supervisor']))
    ) {
      throw new UnAuthorizedCaixaException()
    }

    if (caixa.status.toLocaleLowerCase() === 'fechado') {
      throw new CaixaAlreadyClosedException()
    }
    await this.assertNoVendaAberta(caixa.id)

    const { company_alias, ...caixaData } = data
    caixa.merge({ ...caixaData, status: 'Fechado', data_fecho: DateTime.now() })
    await caixa.save()
    return caixa
  }

  async reopen(id: string, data: ReOpenCaixaDTO) {
    const caixa = await this.findOrFail(id, data.company_alias)
    
    if (
      caixa.user_id !== data.user_id &&
      !(await userHasRole(data.user_id!, ['Admin', 'Gerente', 'Supervisor']))
    ) {
      throw new UnAuthorizedCaixaException()
    }
    if (caixa.status.toLocaleLowerCase() === 'aberto') {
      throw new CaixaIsAlreadyOpenException()
    }

    const { company_alias, ...caixaData } = data
    caixa.merge({ ...caixaData, status: 'Aberto', data_fecho: null })
    await caixa.save()
    return caixa
  }

  async destroy(id: string, data: CloseCaixaDTO | ReOpenCaixaDTO) {

    const caixa = await this.findOrFail(id, data.company_alias)

    if (
      caixa.user_id !== data.user_id &&
      !(await userHasRole(data.user_id!, ['Admin', 'Gerente', 'Supervisor']))
    ) {
      throw new UnAuthorizedCaixaException()
    }

    const isOpen = caixa.status.toLocaleLowerCase() === 'aberto'
    // verificar se a pretenção da execução desta função é reabrir um caixa  e caso seja, faça uma verficação se já existe um caixa aberto do mesmo responsável do caixa
    if (!isOpen) {
      const caixaAberto = await this.baseQuery()
        .join('user', 'caixa.user_id', 'user.id')
        .join('empresa', 'empresa.id', 'user.empresa_id')
        .where('caixa.status', 'aberto')
        .where('empresa.company_alias', data.company_alias!)
        .where('caixa.user_id', caixa.user_id)
        .select('caixa.*')
        .first()

      if (caixaAberto) {
        throw new CaixaAlreadyOpenException()
      }
    } else {
      await this.assertNoVendaAberta(caixa.id)
    }
    const { company_alias, user_id, ...caixaData } = data

    caixa.merge({
      ...caixaData,
      status: isOpen ? 'Fechado' : 'Aberto',
      data_fecho: isOpen ? DateTime.now() : null,
    })

    await caixa.save()
    return caixa
  }

  async listByUser(user_id: string, filter?: CaixaQueryDTO) {
    const query = this.applyFilters(this.baseQuery().where('caixa.user_id', user_id), filter)
    return query.select('caixa.*').paginate(filter?.page ?? 1, filter?.limit ?? 20)
  }
}
